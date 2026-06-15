import { and, eq, lte } from 'drizzle-orm';
import {
  chargeScheduledUpsellPaymentsForOrder,
  reconcilePendingPaymentsWithUpstreamForOrder,
} from './process-scheduled-upsells';
import { db } from '../../db/client';
import { orders, payments } from '../../db/schema';
import {
  type CartRoverCreateOrderArgs,
  CartRoverService,
} from '../../services/cart-rover';
import { SendgridService } from '../../services/sendgrid';
import {
  aggregateLineItems,
  type AggregatedLineItem,
} from './aggregate-items';

type ShippingInfo = {
  street?: unknown;
  houseNumberOrName?: unknown;
  city?: unknown;
  stateOrProvince?: unknown;
  postalCode?: unknown;
  country?: unknown;
};

function str(value: unknown): string {
  return value != null ? String(value) : 'Not Specified';
}

function parseShipping(json: string): ShippingInfo {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as ShippingInfo) : {};
  } catch {
    return {};
  }
}

function parseAggregatedItems(json: string): AggregatedLineItem[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return aggregateLineItems(parsed);
  } catch {
    return [];
  }
}

const LOG = '[sync-payments]';

export async function handleSyncPayments(env: Env): Promise<void> {
  const database = db(env);
  const runStartedAt = new Date().toISOString();

  // Orders that have at least one successful payment, are still pending sync,
  // and have settled long enough that the upsell window has closed (aligned
  // with the bi-hourly cron so deferred upsell charges are spaced from checkout).
  const ordersToSync = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.crover_synced, 'pending'),
        lte(orders.created_at, Date.now() - 2 * 60 * 60 * 1000),
      ),
    );

  console.log(
    `${LOG} cron start at=${runStartedAt} eligibleOrders=${ordersToSync.length} (crover_synced=pending, created_at<=now-2h)`,
  );

  if (ordersToSync.length === 0) {
    console.log(`${LOG} nothing to do; exiting`);
    return;
  }

  const cartRover = new CartRoverService(
    env.CARTROVER_API_USER,
    env.CARTROVER_API_KEY,
  );
  const sendgrid = new SendgridService(env.SENDGRID_API_KEY);

  for (const order of ordersToSync) {
    console.log(
      `${LOG} --- order id=${order.id} crover_synced=${order.crover_synced} created_at=${order.created_at} ---`,
    );

    const successfulPayments = await database
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.order_id, order.id),
          eq(payments.cpay_status, 'success'),
        ),
      );

    // No successful payment yet — skip this order; we'll try again next run.
    if (successfulPayments.length === 0) {
      console.log(
        `${LOG} order id=${order.id} skip: no successful payments on this order yet`,
      );
      continue;
    }

    const lead = successfulPayments[0];
    console.log(
      `${LOG} order id=${order.id} found successfulPayments=${successfulPayments.length} lead_payment_id=${lead.id}`,
    );

    console.log(
      `${LOG} order id=${order.id} step: reconcilePendingPaymentsWithUpstreamForOrder`,
    );
    await reconcilePendingPaymentsWithUpstreamForOrder(env, database, order.id);

    console.log(
      `${LOG} order id=${order.id} step: chargeScheduledUpsellPaymentsForOrder`,
    );
    await chargeScheduledUpsellPaymentsForOrder(
      env,
      database,
      order,
      lead.customer_id ?? null,
    );

    const [orderForPayload] = await database
      .select()
      .from(orders)
      .where(eq(orders.id, order.id))
      .limit(1);
    const orderRow = orderForPayload ?? order;

    const shipping = parseShipping(orderRow.shipping_info);
    const aggregatedItems = parseAggregatedItems(orderRow.items);
    const totalMinor = aggregatedItems.reduce(
      (sum, item) => sum + (item.amountMinor ?? 0),
      0,
    );
    console.log(
      `${LOG} order id=${order.id} payload: lineItems=${aggregatedItems.length} grandTotalMinor=${totalMinor}`,
    );

    const [firstName, ...rest] = lead.customer_name.split(' ');
    const lastName = rest.join(' ');

    const cartRoverArgs = {
      cust_ref: String(order.id),
      cust_po_no: String(order.id),
      cust_first_name: firstName,
      cust_last_name: lastName,
      ship_first_name: firstName,
      ship_last_name: lastName,
      ship_address_1: `${str(shipping.street)}, ${str(shipping.houseNumberOrName)}`,
      ship_city: str(shipping.city),
      ship_state: str(shipping.stateOrProvince),
      ship_zip: str(shipping.postalCode),
      ship_country: str(shipping.country),
      ship_phone: lead.customer_phone ?? 'Not Specified',
      ship_e_mail: lead.customer_email,
      sub_total: totalMinor / 100,
      grand_total: totalMinor / 100,
      currency_code: 'USD',
      prepaid_order: 'Y',
      order_source: 'fulfillment-checkout-v2',
      items: aggregatedItems.map((item, index) => ({
        line_no: index + 1,
        item: item.sku,
        description: item.description,
        quantity: item.quantity,
        price: item.amountMinor ? item.amountMinor / 100 / item.quantity : undefined,
        extended_amount: item.amountMinor ? item.amountMinor / 100 : undefined,
      })),
    } satisfies CartRoverCreateOrderArgs;

    let cartRoverResponse;
    try {
      console.log(`${LOG} order id=${order.id} step: CartRover createOrder`);
      cartRoverResponse = await cartRover.createOrder(cartRoverArgs);
      if (!cartRoverResponse.success_code) {
        throw new Error(
          cartRoverResponse.message ??
            cartRoverResponse.error_code ??
            'CartRover rejected the order.',
        );
      }
      console.log(
        `${LOG} order id=${order.id} CartRover ok order_number=${cartRoverResponse.order_number ?? 'null'} success_code=${String(cartRoverResponse.success_code)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${LOG} order id=${order.id} CartRover failed; marking crover_synced=failed: ${msg}`,
      );
      await database
        .update(orders)
        .set({ crover_synced: 'failed' })
        .where(eq(orders.id, order.id));
      throw err;
    }

    console.log(
      `${LOG} order id=${order.id} step: persist crover_synced=synced crover_order_id=${cartRoverResponse.order_number ?? 'null'}`,
    );
    await database
      .update(orders)
      .set({
        crover_synced: 'synced',
        crover_order_id: cartRoverResponse.order_number ?? null,
        sent_email: Date.now(),
      })
      .where(eq(orders.id, order.id));

    console.log(
      `${LOG} order id=${order.id} step: Sendgrid order confirmation (to lead email on file)`,
    );
    await sendgrid.sendEmail(
      lead.customer_email,
      'Order Confirmation',
      '<p>Your order has been confirmed.</p>',
    );

    console.log(`${LOG} order id=${order.id} done`);
  }

  console.log(
    `${LOG} cron finished processedOrders=${ordersToSync.length} at=${new Date().toISOString()}`,
  );
}

import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { orders, payments } from '../../db/schema';
import { CPAY_STATUS_PENDING, CPAY_STATUS_SUCCESS } from './payment-status';
import { aggregateLineItems } from './aggregate-items';
import {
  requireSecret,
  resolveEnvironment,
  singlePaymentEndpoint,
  SUCCESS_STATUSES,
  type UpstreamPaymentResponse,
} from './shared';

type Database = ReturnType<typeof db>;

async function mergeLineItemsIntoOrder(
  env: Env,
  orderId: number,
  newLineItems: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  const database = db(env);
  const [order] = await database
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return;

  let existing: unknown;
  try {
    existing = JSON.parse(order.items);
  } catch {
    existing = [];
  }
  const existingArr = Array.isArray(existing) ? existing : [];
  const merged = aggregateLineItems([
    ...(existingArr as Array<Record<string, unknown>>),
    ...newLineItems,
  ]);

  await database
    .update(orders)
    .set({ items: JSON.stringify(merged) })
    .where(eq(orders.id, orderId));
}

/**
 * Persists a successful upstream transition for a `pending` payment row
 * (status flip + optional line-item merge + stored-method hydration). Shared
 * by `/poll-payment` and the sync cron.
 */
export async function applyParsedUpstreamToPaymentRow(
  env: Env,
  database: Database,
  orderId: number,
  targetPayment: typeof payments.$inferSelect,
  parsed: UpstreamPaymentResponse,
): Promise<void> {
  const isNowSuccess = !!parsed?.status && SUCCESS_STATUSES.has(parsed.status);

  if (targetPayment.cpay_status === CPAY_STATUS_PENDING && isNowSuccess) {
    await database
      .update(payments)
      .set({ cpay_status: CPAY_STATUS_SUCCESS })
      .where(eq(payments.id, targetPayment.id));

    let lineItems: Array<Record<string, unknown>> = [];
    try {
      const parsedItems = JSON.parse(targetPayment.line_items);
      if (Array.isArray(parsedItems)) lineItems = parsedItems;
    } catch {
      lineItems = [];
    }
    if (lineItems.length > 0) {
      await mergeLineItemsIntoOrder(env, orderId, lineItems);
    }
  }

  if (isNowSuccess && parsed) {
    const storedMethodId = parsed.paymentMethodDetails?.storedPaymentMethodId ?? null;
    if (storedMethodId) {
      const [currentOrder] = await database
        .select({ stored_payment_method_id: orders.stored_payment_method_id })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (currentOrder && !currentOrder.stored_payment_method_id) {
        await database
          .update(orders)
          .set({ stored_payment_method_id: storedMethodId })
          .where(eq(orders.id, orderId));
      }
    }
  }
}

export async function fetchUpstreamPaymentById(
  env: Env,
  cpayId: string,
): Promise<{ response: Response; parsed: UpstreamPaymentResponse | null; text: string } | Response> {
  const secret = requireSecret(env);
  if (secret instanceof Response) return secret;

  const environment = resolveEnvironment(env);

  let upstream: Response;
  try {
    upstream = await fetch(singlePaymentEndpoint(environment, cpayId), {
      method: 'GET',
      headers: {
        Authorization: secret,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: true,
        message: `Upstream payment poll failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const text = await upstream.text();
  let parsed: UpstreamPaymentResponse | null = null;
  try {
    parsed = text ? (JSON.parse(text) as UpstreamPaymentResponse) : null;
  } catch {
    parsed = null;
  }

  return { response: upstream, parsed, text };
}

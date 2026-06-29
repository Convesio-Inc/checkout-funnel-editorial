/**
 * Store Manager `order.created` notification.
 * -----------------------------------------------------------------------------
 * Fire-and-forget POST to the campaign webhook (`STORE_MANAGER_CAMPAIGN_URL`)
 * after a payment is confirmed successful. This worker is stateless — there is
 * no database to read from — so the payload is built entirely from data carried
 * through the signed thank-you JWT (see `worker/jwt.ts`) plus the
 * upstream-confirmed payment identity.
 *
 * Mirrors the integration in the sibling `checkout-funnel-v2` repo: same price
 * math (minor → major decimal strings), name split, and ConvesioPay
 * shipping-shape mapping. The emitted payload follows the Store Manager
 * `order.created` schema agreed for this funnel.
 *
 * `sendOrderCreated` never throws and never blocks the checkout flow: if the
 * URL is unset or the POST fails it just logs and returns.
 * -----------------------------------------------------------------------------
 */

import type { ReceiptLineItem } from './jwt';

/** Identifies this checkout to the Store Manager. One-liner to change. */
const SOURCE = 'checkout-funnel-editorial';

// Demo fallbacks for fields a stateless checkout doesn't always carry (e.g. a
// 3DS return that lost the shipping address). The goal is a well-formed
// order.created event, not perfect data fidelity.
const DEMO = {
  currency: 'USD',
  country: 'United States',
  customerEmail: 'customer@example.com',
  firstName: 'Customer',
  lastName: '',
  address1: '123 Example Street',
  city: 'Example City',
  zip: '00000',
  itemName: 'Checkout Item',
  itemAmountMinor: 100,
} as const;

export interface StoreManagerOrderInput {
  /** Order identifier shown to Store Manager — the CPAY `orderNumber`. */
  externalId: string;
  /** Upstream customer id, when known. */
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  /** Raw shipping address in the ConvesioPay shape carried in the JWT. */
  shippingAddress: unknown;
  /** Display line items carried in the JWT (amounts in minor units). */
  lineItems: ReceiptLineItem[];
  currency: string | null;
}

function toMajor(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

function splitName(full: string | null): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: DEMO.firstName, last: DEMO.lastName };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Maps the ConvesioPay shipping shape
// ({ houseNumberOrName, street, city, stateOrProvince, postalCode, country })
// to Store Manager's address schema, including the customer's name.
function mapShipping(
  raw: unknown,
  name: { first: string; last: string },
  phone: string | null,
): Record<string, unknown> {
  const a =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    first_name: name.first,
    last_name: name.last,
    address1: str(a.street) || DEMO.address1,
    address2: str(a.houseNumberOrName),
    city: str(a.city) || DEMO.city,
    province: str(a.stateOrProvince),
    state: str(a.stateOrProvince),
    country: str(a.country) || DEMO.country,
    zip: str(a.postalCode) || DEMO.zip,
    phone: phone ?? '',
  };
}

/**
 * Builds the Store Manager `order.created` payload. Pure: no I/O. Amounts
 * carried in the JWT are minor units (cents); Store Manager wants major-unit
 * decimal strings.
 */
export function buildOrderCreatedPayload(input: StoreManagerOrderInput) {
  const effective: ReceiptLineItem[] =
    input.lineItems.length > 0
      ? input.lineItems
      : [
          {
            sku: '',
            description: DEMO.itemName,
            quantity: 1,
            amountMinor: DEMO.itemAmountMinor,
          },
        ];

  const name = splitName(input.customerName);

  const line_items = effective.map((item) => {
    const quantity = item.quantity > 0 ? item.quantity : 1;
    const unitMinor = Math.round(item.amountMinor / quantity);
    return {
      name: item.description || DEMO.itemName,
      sku: item.sku || null,
      quantity: item.quantity,
      unit_price: toMajor(unitMinor),
    };
  });

  return {
    source: SOURCE,
    order: {
      external_id: input.externalId,
      status: 'confirmed',
      currency: input.currency || DEMO.currency,
      shipping_address: mapShipping(input.shippingAddress, name, input.customerPhone),
      customer: {
        external_id: input.customerId || `customer-${input.externalId}`,
        first_name: name.first,
        last_name: name.last,
        email: input.customerEmail || DEMO.customerEmail,
        phone: input.customerPhone || '',
      },
      line_items,
    },
  };
}

/**
 * POST the `order.created` payload to `STORE_MANAGER_CAMPAIGN_URL`. No-op when
 * the var is unset. Never throws — a failed notification must not break the
 * customer's checkout.
 */
export async function sendOrderCreated(
  env: Env,
  input: StoreManagerOrderInput,
): Promise<void> {
  const url = env.STORE_MANAGER_CAMPAIGN_URL?.trim();
  if (!url) {
    // No campaign configured for this environment — nothing to do.
    return;
  }

  const payload = buildOrderCreatedPayload(input);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(
      `[store-manager] order.created POST failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(
      `[store-manager] order.created returned ${response.status}: ${text}`,
    );
    return;
  }

  console.log(
    `[store-manager] order.created sent for order ${input.externalId}`,
  );
}

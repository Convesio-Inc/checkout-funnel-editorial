/**
 * `/order-confirmed` — fire the Store Manager `order.created` notification for a
 * confirmed payment.
 *
 * Called by the thank-you page the first time its state machine reaches a
 * terminal success (immediate, polled, or post-3DS). It is intentionally
 * authoritative-by-recheck: the token's `status` can be stale (e.g. "Pending"
 * on the polled path) and could in principle be replayed, so we always re-`GET`
 * the payment upstream and only notify when CPAY itself reports success. The
 * customer / shipping / line-item display data comes from the (tamper-evident)
 * token. Best-effort: a missing `STORE_MANAGER_CAMPAIGN_URL` is a silent no-op.
 */

import { verifyCheckoutToken } from '../../jwt';
import { sendOrderCreated } from '../../store-manager';
import { json, readJson } from '../common';
import {
  requireSecret,
  resolveEnvironment,
  singlePaymentEndpoint,
  SUCCESS_STATUSES,
  type UpstreamPaymentResponse,
} from './shared';

interface OrderConfirmedBody {
  token?: string;
}

export async function handleOrderConfirmed(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<OrderConfirmedBody>(request);
  const token = body?.token?.trim();
  if (!token) {
    return json(
      { ok: false, message: 'Missing `token` in request body.' },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = await verifyCheckoutToken(token, env.CPAY_SECRET);
  } catch (err) {
    return json(
      {
        ok: false,
        message: `Invalid or expired token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 400 },
    );
  }

  const paymentId = payload.payment_id?.trim();
  if (!paymentId) {
    // Marker token from the 3DS return URL (no id yet) — nothing to confirm.
    return json({ ok: false, status: payload.status ?? null });
  }

  const secret = requireSecret(env);
  if (secret instanceof Response) return secret;

  const environment = resolveEnvironment(env);

  // Authoritative re-check: confirm with CPAY directly before notifying.
  let upstream: Response;
  try {
    upstream = await fetch(singlePaymentEndpoint(environment, paymentId), {
      method: 'GET',
      headers: {
        Authorization: secret,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    return json(
      {
        ok: false,
        message: `Upstream payment lookup failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let parsed: UpstreamPaymentResponse | null = null;
  try {
    parsed = text ? (JSON.parse(text) as UpstreamPaymentResponse) : null;
  } catch {
    parsed = null;
  }

  if (
    !upstream.ok ||
    !parsed ||
    parsed.error ||
    !parsed.status ||
    !SUCCESS_STATUSES.has(parsed.status)
  ) {
    return json({ ok: false, status: parsed?.status ?? null });
  }

  await sendOrderCreated(env, {
    externalId: payload.order_number || parsed.orderNumber || paymentId,
    customerId:
      parsed.customerId ?? parsed.customer?.id ?? payload.customer_id ?? null,
    customerName: payload.customer_name ?? null,
    customerEmail: payload.customer_email ?? null,
    customerPhone: payload.customer_phone ?? null,
    shippingAddress: payload.shipping_address ?? null,
    lineItems: payload.items ?? [],
    currency: typeof parsed.currency === 'string' ? parsed.currency : null,
  });

  return json({ ok: true });
}

import { signCheckoutToken } from '../../jwt';
import { json, readJson } from '../common';
import {
  buildReceiptContext,
  PENDING_STATUSES,
  type PaymentRequestBody,
  paymentsEndpoint,
  REQUIRED_FIELDS,
  requireSecret,
  resolveEnvironment,
  SUCCESS_STATUSES,
  type UpstreamPaymentResponse,
} from './shared';

export async function handlePayments(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<PaymentRequestBody>(request);
  if (!body) {
    return json({ error: true, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const missing = REQUIRED_FIELDS.filter((key) => {
    const value = body[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    return json(
      { error: true, message: `Missing required field(s): ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  const secret = requireSecret(env);
  if (secret instanceof Response) return secret;

  const environment = resolveEnvironment(env);
  const origin = new URL(request.url).origin;
  const orderNumber = body.orderNumber ?? crypto.randomUUID();
  const receipt = buildReceiptContext(body);

  // Pre-sign a "marker" JWT baked into the 3DS `returnUrl`. It carries the
  // receipt context (so the thank-you page can render the summary after the
  // bank round-trip) but no `payment_id` yet — that's minted after the
  // upstream call. The empty `payment_id` is the thank-you page's signal to
  // resume via `/issue-token` using the id it stashed in sessionStorage.
  let returnMarkerToken: string;
  try {
    returnMarkerToken = await signCheckoutToken(
      {
        payment_id: '',
        customer_id: '',
        order_number: orderNumber,
        status: 'AwaitingAction',
        ...receipt,
      },
      env.CPAY_SECRET,
    );
  } catch (err) {
    return json(
      {
        error: true,
        message: `Failed to sign return marker token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 },
    );
  }

  const defaultReturnUrl = `${origin}/thank-you?token=${encodeURIComponent(
    returnMarkerToken,
  )}`;

  const payload = {
    ...body,
    integration: env.CPAY_INTEGRATION,
    returnUrl: body.returnUrl ?? defaultReturnUrl,
    orderNumber,
    lineItems: body.lineItems?.map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        description: item.description,
        quantity: item.quantity,
        amountIncludingTax: item.amountIncludingTax,
      };
    }),
  };

  let upstream: Response;
  try {
    upstream = await fetch(paymentsEndpoint(environment), {
      method: 'POST',
      headers: {
        Authorization: secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json(
      {
        error: true,
        message: `Upstream payment request failed: ${
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

  const upstreamOk = upstream.ok && !parsed?.error;
  const upstreamStatus = parsed?.status;

  // 3DS challenge: pass the body through untouched. The SPA navigates the user
  // to `actionRequired.redirectUrl` and, on return, calls `/issue-token` with
  // the payment id it stashed in sessionStorage.
  if (upstreamOk && parsed?.actionRequired?.redirectUrl) {
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  const isTerminalOk =
    upstreamOk &&
    !!upstreamStatus &&
    (SUCCESS_STATUSES.has(upstreamStatus) ||
      PENDING_STATUSES.has(upstreamStatus));

  if (!isTerminalOk || !parsed) {
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  let token: string;
  try {
    token = await signCheckoutToken(
      {
        payment_id: parsed.id ?? '',
        customer_id: parsed.customerId ?? parsed.customer?.id ?? '',
        order_number: parsed.orderNumber ?? orderNumber,
        status: upstreamStatus,
        ...receipt,
      },
      env.CPAY_SECRET,
    );
  } catch (err) {
    return json(
      {
        error: true,
        message: `Failed to sign redirect token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 },
    );
  }

  const redirectUrl = `${origin}/thank-you?token=${encodeURIComponent(token)}`;
  return json({ ...parsed, redirectUrl }, { status: upstream.status });
}

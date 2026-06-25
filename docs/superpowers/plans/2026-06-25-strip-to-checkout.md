# Strip fulfillment-checkout-v3 to a Stateless Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the database, order management, admin/auth, users, crons, CartRover, SendGrid, and upsells from the v3 checkout — leaving a stateless ConvesioPay checkout with the MERIDIAN editorial UI intact, where ConvesioPay is the single source of truth.

**Architecture:** The Worker keeps five routes (`/config`, `/payments`, `/verify-token`, `/issue-token`, `/poll-payment`), rewritten to be stateless: the flow keys off the ConvesioPay `payment_id` (with a random `order_number`), and the worker embeds the purchased line items + shipping + customer into the signed thank-you JWT so the receipt renders with no storage. The SPA keeps the editorial checkout + thank-you pages and the three core hooks, rewired to the `payment_id` model.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, React Router 7, `jose` (JWT), Cloudflare Workers (`@cloudflare/vite-plugin`, Wrangler).

**Verification model:** This repo has no unit-test harness. Each task is gated by a real, observable check — worker typecheck (`npx tsc -p tsconfig.worker.json --noEmit`), full build (`npm run build`), `npm run lint`, and (final task) a live browser checkout via the preview tools. There is no `git push` in this plan; commits land on `main` locally.

**Reference:** The sibling repo `../convesio-spa-checkout-template` is the canonical stateless implementation; several files below are adapted directly from it.

---

## File Map

**Worker — rewrite (stateless):**
- `worker/jwt.ts` — JWT payload gains embedded receipt context.
- `worker/handlers/payments/shared.ts` — trim to checkout-only types/consts; add receipt-context builders.
- `worker/handlers/common.ts` — trim to `json` + `readJson`.
- `worker/handlers/payments/payments.ts` — stateless; embed context.
- `worker/handlers/payments/verify-token.ts` — return decoded context.
- `worker/handlers/payments/issue-token.ts` — stateless; copy context from marker token.
- `worker/handlers/payments/poll-payment.ts` — key off `payment_id`.
- `worker/index.ts` — five routes; no `scheduled()`.
- `worker/env.d.ts` — drop DB + removed-service vars.
- `worker/handlers/config/config.ts` — unchanged (keep).

**Worker — delete:** `worker/db/**`, `worker/handlers/auth/**`, `worker/handlers/orders/**`, `worker/handlers/users/**`, `worker/services/**`, and `worker/handlers/payments/{upsell-payment,stored-card-charge,sync-payments,process-scheduled-upsells,list-payments,apply-upstream-to-payment,aggregate-items,payment-status}.ts`.

**Front-end — rewrite:** `src/hooks/useCheckoutPayment.ts`, `src/hooks/useThankYouPayment.ts`, `src/pages/ThankYouPage.tsx`, `src/layouts/ShopLayout.tsx`, `src/App.tsx`.

**Front-end — delete:** `src/components/{orders,users,dashboard,settings,login,auth}/**`, `src/components/site/LoggedInBar.tsx`, `src/components/thank-you/{UpsellOfferBanner,UpsellCheckoutModal}.tsx`, `src/components/ui/drawer.tsx`, `src/pages/{OrderPage,UsersPage,LoginPage}.tsx`, `src/layouts/DashboardLayout.tsx`, `src/providers/{AuthProvider,OrdersProvider,UsersProvider,OrderDrawerProvider}.tsx`, `src/context/{auth,orders,users,orderDrawer}.ts`, `src/hooks/{useAuth,useOrders,useUsers,useOrderDrawer}.ts`, `src/lib/{orders,users}.ts`, `src/query-options/**`, `src/mutation-options/**`, `src/utils/orders.ts`.

**Config/docs:** `wrangler.jsonc`, `package.json`, `.dev.vars`, `.env`, `.env.example`, `README.md`.

---

## Task 1: Rewrite the Worker checkout handlers to be stateless

Rewrites the five active routes so none import the DB, then re-points `index.ts`. Dead worker files (db/auth/orders/users/services) stay on disk this task — they still typecheck because `env.DB` is still declared. They're deleted in Task 2.

**Files:**
- Modify: `worker/jwt.ts`
- Modify: `worker/handlers/payments/shared.ts`
- Modify: `worker/handlers/common.ts`
- Modify: `worker/handlers/payments/payments.ts`
- Modify: `worker/handlers/payments/verify-token.ts`
- Modify: `worker/handlers/payments/issue-token.ts`
- Modify: `worker/handlers/payments/poll-payment.ts`
- Modify: `worker/index.ts`

- [ ] **Step 1: Rewrite `worker/jwt.ts`** — add the embedded receipt context to the signed payload.

```ts
/**
 * JWT helpers for the thank-you redirect flow.
 * -----------------------------------------------------------------------------
 * The worker signs a short-lived HS256 token after a successful/pending
 * payment and appends it to the `redirectUrl` pointing at `/thank-you`. The
 * thank-you page then calls `/verify-token` to read the payload back.
 *
 * Because there is no database, the token also carries the receipt context
 * (line items, shipping address, customer) captured at `/payments` time, so
 * the thank-you page can render the order summary without any storage. The
 * signing secret is `CPAY_SECRET`; the token exists to carry this data through
 * a browser redirect with a tamper-evident wrapper.
 * -----------------------------------------------------------------------------
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface ReceiptLineItem {
  sku: string;
  description: string;
  quantity: number;
  amountMinor: number;
}

export interface CheckoutTokenPayload extends JWTPayload {
  payment_id: string;
  customer_id: string;
  order_number: string;
  status: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  shipping_address?: Record<string, unknown> | null;
  items?: ReceiptLineItem[];
}

function keyFromSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signCheckoutToken(
  payload: Omit<CheckoutTokenPayload, keyof JWTPayload>,
  secret: string,
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .sign(keyFromSecret(secret));
}

export async function verifyCheckoutToken(
  token: string,
  secret: string,
): Promise<CheckoutTokenPayload> {
  const { payload } = await jwtVerify(token, keyFromSecret(secret));
  return payload as CheckoutTokenPayload;
}
```

- [ ] **Step 2: Rewrite `worker/handlers/payments/shared.ts`** — keep the existing exports (the still-present dead handlers reference them; they get trimmed in Task 2) and add the receipt-context builders.

```ts
import type { ReceiptLineItem } from '../../jwt';
import { json } from '../common';

const CPAY_API_HOSTS = {
  live: 'https://api.convesiopay.com',
  test: 'https://api-qa.convesiopay.com',
} as const;

export function paymentsEndpoint(environment: 'test' | 'live'): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments`;
}

export function singlePaymentEndpoint(
  environment: 'test' | 'live',
  paymentId: string,
): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments/${encodeURIComponent(paymentId)}`;
}

// Retained until Task 2 — the dead upsell/stored-card handlers still import it.
export function storedCardEndpoint(environment: 'test' | 'live'): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments/stored-card`;
}

export function resolveEnvironment(env: Env): 'test' | 'live' {
  return env.CPAY_ENVIRONMENT === 'live' ? 'live' : 'test';
}

// Intentionally duplicated in src/hooks/useCheckoutPayment.ts and
// src/hooks/useThankYouPayment.ts — the SPA bundles separately and cannot
// import from the worker. Keep all three in sync when adding statuses.
export const SUCCESS_STATUSES = new Set(['Succeeded', 'Authorized']);
export const PENDING_STATUSES = new Set(['Pending']);

export interface PaymentRequestBody {
  paymentToken: string;
  email: string;
  name: string;
  amount: number;
  currency: string;
  orderNumber?: string;
  returnUrl?: string;
  phone?: { number: string; countryCode: string };
  billingAddress?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  lineItems?: Array<Record<string, unknown>>;
  captureMethod?: 'automatic' | 'manual';
  storePaymentMethod?: boolean; // retained until Task 2
}

export const REQUIRED_FIELDS: Array<keyof PaymentRequestBody> = [
  'paymentToken',
  'email',
  'name',
  'amount',
  'currency',
];

export interface UpstreamActionRequired {
  type?: string;
  redirectUrl?: string;
  [key: string]: unknown;
}

export interface UpstreamPaymentResponse {
  id?: string;
  orderNumber?: string;
  status?: string;
  customerId?: string;
  customer?: { id?: string };
  actionRequired?: UpstreamActionRequired;
  paymentMethodDetails?: { storedPaymentMethodId?: string;[key: string]: unknown }; // retained until Task 2
  error?: boolean;
  message?: string;
  [key: string]: unknown;
}

// Retained until Task 2 — the dead card-on-file handler still imports it.
export interface CardOnFilePaymentRequestBody {
  order_id: number;
  amount: number;
  currency: string;
  lineItems?: Array<Record<string, unknown>>;
}

export function requireSecret(env: Env): Response | string {
  const secret = env.CPAY_SECRET?.trim();
  if (!secret) {
    return json(
      {
        error: true,
        message:
          'Worker is missing CPAY_SECRET. Set it via `wrangler secret put` or your `.env` / `.dev.vars`.',
      },
      { status: 500 },
    );
  }
  return secret;
}

export interface ReceiptContext {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, unknown> | null;
  items: ReceiptLineItem[];
}

export function buildCustomerPhone(
  phone: PaymentRequestBody['phone'],
): string {
  if (!phone) return '';
  const prefix = phone.countryCode?.trim() ?? '';
  const number = phone.number?.trim() ?? '';
  if (!prefix && !number) return '';
  return `${prefix} ${number}`.trim();
}

export function buildReceiptItems(
  lineItems: PaymentRequestBody['lineItems'],
): ReceiptLineItem[] {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      sku: String(item.sku ?? ''),
      description: String(item.description ?? ''),
      quantity: Number(item.quantity ?? 1),
      amountMinor: Number(item.amountIncludingTax ?? 0),
    };
  });
}

export function buildReceiptContext(body: PaymentRequestBody): ReceiptContext {
  return {
    customer_name: body.name,
    customer_email: body.email,
    customer_phone: buildCustomerPhone(body.phone),
    shipping_address: body.shippingAddress ?? null,
    items: buildReceiptItems(body.lineItems),
  };
}
```

- [ ] **Step 3: Leave `worker/handlers/common.ts` unchanged in this task.** The still-present dead handlers (`auth/shared.ts`, `orders/*`, `users/*`, `payments/list-payments.ts`) import `withPaginationHeaders` / `parseOptional*` / `readJsonFromResponse` from it, so trimming now would break the typecheck. It is trimmed in Task 2 after those files are deleted. The rewritten checkout handlers only use `json` / `readJson`, which already exist there.

- [ ] **Step 4: Rewrite `worker/handlers/payments/payments.ts`** — stateless; embed receipt context in both the marker and the success/pending token.

```ts
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
```

- [ ] **Step 5: Rewrite `worker/handlers/payments/verify-token.ts`** — return the decoded context (no DB).

```ts
import { verifyCheckoutToken } from '../../jwt';
import { json, readJson } from '../common';

interface VerifyTokenBody {
  token?: string;
}

export async function handleVerifyToken(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<VerifyTokenBody>(request);
  const token = body?.token?.trim();
  if (!token) {
    return json(
      { error: true, message: 'Missing `token` in request body.' },
      { status: 400 },
    );
  }

  try {
    const payload = await verifyCheckoutToken(token, env.CPAY_SECRET);
    return json({
      payment_id: payload.payment_id,
      customer_id: payload.customer_id,
      order_number: payload.order_number,
      status: payload.status,
      customer_name: payload.customer_name ?? null,
      customer_email: payload.customer_email ?? null,
      customer_phone: payload.customer_phone ?? null,
      shipping_address: payload.shipping_address ?? null,
      items: payload.items ?? [],
    });
  } catch (err) {
    return json(
      {
        error: true,
        message: `Invalid or expired token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 6: Rewrite `worker/handlers/payments/issue-token.ts`** — stateless; carry the receipt context forward from the marker token (`context_token`).

```ts
import { signCheckoutToken, verifyCheckoutToken } from '../../jwt';
import { json, readJson } from '../common';
import {
  requireSecret,
  resolveEnvironment,
  singlePaymentEndpoint,
  SUCCESS_STATUSES,
  type UpstreamPaymentResponse,
} from './shared';

interface IssueTokenBody {
  payment_id?: string;
  /** The marker token the SPA still holds from the 3DS return URL. Used to
   *  carry the receipt context (items/shipping/customer) into the freshly
   *  minted token so the thank-you receipt survives a refresh. Optional. */
  context_token?: string;
}

export async function handleIssueToken(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<IssueTokenBody>(request);
  const paymentId = body?.payment_id?.trim();
  if (!paymentId) {
    return json(
      { error: true, message: 'Missing `payment_id` in request body.' },
      { status: 400 },
    );
  }

  const secret = requireSecret(env);
  if (secret instanceof Response) return secret;

  const environment = resolveEnvironment(env);

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
        error: true,
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

  if (!upstream.ok || !parsed || parsed.error) {
    return json(
      {
        error: true,
        message:
          parsed?.message ??
          `Payment not found (${upstream.status} ${upstream.statusText})`,
      },
      { status: upstream.status === 200 ? 404 : upstream.status },
    );
  }

  // Recover the receipt context from the marker token the SPA still holds, so
  // the re-minted token is self-contained (refresh-safe). Non-fatal if absent.
  let context: Record<string, unknown> = {};
  if (body?.context_token) {
    try {
      const decoded = await verifyCheckoutToken(body.context_token, env.CPAY_SECRET);
      context = {
        customer_name: decoded.customer_name,
        customer_email: decoded.customer_email,
        customer_phone: decoded.customer_phone,
        shipping_address: decoded.shipping_address,
        items: decoded.items,
      };
    } catch {
      // ignore — the receipt falls back to the static product display.
    }
  }

  let token: string;
  try {
    // Right after a 3DS challenge upstream often still reports a transitional
    // status until the webhook settles. Preserve only a known terminal
    // success; otherwise write "Pending" so the thank-you page polls.
    const statusForToken =
      parsed.status && SUCCESS_STATUSES.has(parsed.status)
        ? parsed.status
        : 'Pending';
    token = await signCheckoutToken(
      {
        payment_id: parsed.id ?? paymentId,
        customer_id: parsed.customerId ?? parsed.customer?.id ?? '',
        order_number: parsed.orderNumber ?? '',
        status: statusForToken,
        ...context,
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

  return json({ token });
}
```

- [ ] **Step 7: Rewrite `worker/handlers/payments/poll-payment.ts`** — key off `payment_id`.

```ts
import { json, readJson } from '../common';
import {
  requireSecret,
  resolveEnvironment,
  singlePaymentEndpoint,
} from './shared';

interface PollPaymentBody {
  payment_id?: string;
}

export async function handlePollPayment(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<PollPaymentBody>(request);
  const paymentId = body?.payment_id?.trim();
  if (!paymentId) {
    return json(
      { error: true, message: 'Missing `payment_id` in request body.' },
      { status: 400 },
    );
  }

  const secret = requireSecret(env);
  if (secret instanceof Response) return secret;

  const environment = resolveEnvironment(env);

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
        error: true,
        message: `Upstream payment poll failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 8: Rewrite `worker/index.ts`** — five routes; remove the `scheduled()` handler and all auth/orders/users imports.

```ts
import { handleConfig } from './handlers/config/config';
import { handleIssueToken } from './handlers/payments/issue-token';
import { handlePayments } from './handlers/payments/payments';
import { handlePollPayment } from './handlers/payments/poll-payment';
import { handleVerifyToken } from './handlers/payments/verify-token';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/config' && request.method === 'GET') {
      return handleConfig(env);
    }

    if (url.pathname === '/payments' && request.method === 'POST') {
      return handlePayments(request, env);
    }

    if (url.pathname === '/verify-token' && request.method === 'POST') {
      return handleVerifyToken(request, env);
    }

    if (url.pathname === '/issue-token' && request.method === 'POST') {
      return handleIssueToken(request, env);
    }

    if (url.pathname === '/poll-payment' && request.method === 'POST') {
      return handlePollPayment(request, env);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 9: Typecheck the worker**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npx tsc -p tsconfig.worker.json --noEmit`
Expected: no errors. (The dead db/auth/orders/users files still compile because `env.DB` is still declared in `env.d.ts`.)

- [ ] **Step 10: Commit**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git add worker/jwt.ts worker/handlers/payments/shared.ts worker/handlers/payments/payments.ts worker/handlers/payments/verify-token.ts worker/handlers/payments/issue-token.ts worker/handlers/payments/poll-payment.ts worker/index.ts
git commit -m "refactor(worker): rewrite checkout handlers to stateless, JWT-embedded receipt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Delete dead Worker code and trim the Env type

**Files:**
- Delete: `worker/db/**`, `worker/handlers/auth/**`, `worker/handlers/orders/**`, `worker/handlers/users/**`, `worker/services/**`, and the 8 dead payment handlers.
- Modify: `worker/env.d.ts`

- [ ] **Step 1: Delete the dead worker directories and files**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git rm -r worker/db worker/handlers/auth worker/handlers/orders worker/handlers/users worker/services
git rm worker/handlers/payments/upsell-payment.ts \
       worker/handlers/payments/stored-card-charge.ts \
       worker/handlers/payments/sync-payments.ts \
       worker/handlers/payments/process-scheduled-upsells.ts \
       worker/handlers/payments/list-payments.ts \
       worker/handlers/payments/apply-upstream-to-payment.ts \
       worker/handlers/payments/aggregate-items.ts \
       worker/handlers/payments/payment-status.ts
```

- [ ] **Step 2: Trim `worker/handlers/payments/shared.ts`** — now that the dead handlers are gone, remove the stored-card endpoint, `storePaymentMethod`, `paymentMethodDetails`, and `CardOnFilePaymentRequestBody`. Replace the file with this lean version:

```ts
import type { ReceiptLineItem } from '../../jwt';
import { json } from '../common';

const CPAY_API_HOSTS = {
  live: 'https://api.convesiopay.com',
  test: 'https://api-qa.convesiopay.com',
} as const;

export function paymentsEndpoint(environment: 'test' | 'live'): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments`;
}

export function singlePaymentEndpoint(
  environment: 'test' | 'live',
  paymentId: string,
): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments/${encodeURIComponent(paymentId)}`;
}

export function resolveEnvironment(env: Env): 'test' | 'live' {
  return env.CPAY_ENVIRONMENT === 'live' ? 'live' : 'test';
}

// Intentionally duplicated in src/hooks/useCheckoutPayment.ts and
// src/hooks/useThankYouPayment.ts — the SPA bundles separately and cannot
// import from the worker. Keep all three in sync when adding statuses.
export const SUCCESS_STATUSES = new Set(['Succeeded', 'Authorized']);
export const PENDING_STATUSES = new Set(['Pending']);

export interface PaymentRequestBody {
  paymentToken: string;
  email: string;
  name: string;
  amount: number;
  currency: string;
  orderNumber?: string;
  returnUrl?: string;
  phone?: { number: string; countryCode: string };
  billingAddress?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  lineItems?: Array<Record<string, unknown>>;
  captureMethod?: 'automatic' | 'manual';
}

export const REQUIRED_FIELDS: Array<keyof PaymentRequestBody> = [
  'paymentToken',
  'email',
  'name',
  'amount',
  'currency',
];

export interface UpstreamActionRequired {
  type?: string;
  redirectUrl?: string;
  [key: string]: unknown;
}

export interface UpstreamPaymentResponse {
  id?: string;
  orderNumber?: string;
  status?: string;
  customerId?: string;
  customer?: { id?: string };
  actionRequired?: UpstreamActionRequired;
  error?: boolean;
  message?: string;
  [key: string]: unknown;
}

export function requireSecret(env: Env): Response | string {
  const secret = env.CPAY_SECRET?.trim();
  if (!secret) {
    return json(
      {
        error: true,
        message:
          'Worker is missing CPAY_SECRET. Set it via `wrangler secret put` or your `.env` / `.dev.vars`.',
      },
      { status: 500 },
    );
  }
  return secret;
}

export interface ReceiptContext {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, unknown> | null;
  items: ReceiptLineItem[];
}

export function buildCustomerPhone(
  phone: PaymentRequestBody['phone'],
): string {
  if (!phone) return '';
  const prefix = phone.countryCode?.trim() ?? '';
  const number = phone.number?.trim() ?? '';
  if (!prefix && !number) return '';
  return `${prefix} ${number}`.trim();
}

export function buildReceiptItems(
  lineItems: PaymentRequestBody['lineItems'],
): ReceiptLineItem[] {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      sku: String(item.sku ?? ''),
      description: String(item.description ?? ''),
      quantity: Number(item.quantity ?? 1),
      amountMinor: Number(item.amountIncludingTax ?? 0),
    };
  });
}

export function buildReceiptContext(body: PaymentRequestBody): ReceiptContext {
  return {
    customer_name: body.name,
    customer_email: body.email,
    customer_phone: buildCustomerPhone(body.phone),
    shipping_address: body.shippingAddress ?? null,
    items: buildReceiptItems(body.lineItems),
  };
}
```

- [ ] **Step 3: Trim `worker/handlers/common.ts`** — keep only `json` + `readJson`. Replace the file with:

```ts
export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rewrite `worker/env.d.ts`** — remove the `DB` binding and the removed-service secrets.

```ts
/**
 * Augments the generated Cloudflare `Env` interface with the secrets +
 * vars we declare in `wrangler.jsonc`. Keeps the generated
 * `worker-configuration.d.ts` untouched (it gets regenerated by
 * `wrangler types`), while still giving us typed `env.CPAY_*` access.
 */
interface Env {
  CPAY_API_KEY: string;
  CPAY_SECRET: string;
  CPAY_INTEGRATION: string;
  CPAY_ENVIRONMENT?: ConvesioPayEnvironmentValue;
}

type ConvesioPayEnvironmentValue = "test" | "live";
```

- [ ] **Step 5: Confirm no stragglers reference removed worker modules or trimmed symbols**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && grep -rnE "db/client|db/schema|services/|handlers/(auth|orders|users)|env\.DB|storedCardEndpoint|CardOnFilePaymentRequestBody|withPaginationHeaders|parseOptional" worker || echo "CLEAN"`
Expected: `CLEAN`

- [ ] **Step 6: Typecheck the worker**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npx tsc -p tsconfig.worker.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git add -A worker
git commit -m "refactor(worker): delete DB, auth, orders, users, services, and upsell/cron handlers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rewire the front-end to the stateless model

Rewrites the three coupled entry points + the two hooks. The two **upsell components are deleted here** because they depend on the `useThankYouPayment` types being changed (they're the only non-`ThankYouPage` files that do). The remaining dead admin files stay on disk this task (still valid TypeScript — they don't import the checkout hooks) and are deleted in Task 4.

**Files:**
- Modify: `src/hooks/useCheckoutPayment.ts`
- Modify: `src/hooks/useThankYouPayment.ts`
- Modify: `src/pages/ThankYouPage.tsx`
- Modify: `src/layouts/ShopLayout.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: `src/hooks/useCheckoutPayment.ts` — drop `order_id` from the response type.** Replace the `PaymentResponse` `order_id` doc/field block (the JSDoc lines beginning `/** Local orders.id, returned by the worker...` through the `order_id?: number;` line) with nothing. Concretely, remove these lines:

```ts
  /** Local orders.id, returned by the worker on a successful (non-3DS)
   *  payment. The thank-you redirect URL already carries it inside the JWT,
   *  but it's also surfaced top-level so callers can read it without
   *  decoding the token. */
  order_id?: number;
```

- [ ] **Step 2: `src/hooks/useCheckoutPayment.ts` — change the sessionStorage entry to carry `payment_id`.** Replace the `PendingPaymentSessionEntry` interface:

```ts
export interface PendingPaymentSessionEntry {
  /** cpay payment id of the in-flight payment — the key for resuming the
   *  flow on the thank-you page after a 3DS challenge. */
  payment_id: string;
  saved_at: number;
}
```

- [ ] **Step 3: `src/hooks/useCheckoutPayment.ts` — rewrite the 3DS handoff branch** to stash `payment_id`. Replace the whole `if (body?.actionRequired?.redirectUrl && body.id && typeof body.order_id === "number")` block with:

```ts
      // 3DS handoff: ConvesioPay flagged the payment and wants the user to
      // complete a challenge on their hosted verify-customer page. Stash the
      // payment id in sessionStorage so `/thank-you` can mint a JWT via
      // `/issue-token` on return, then navigate out. The processing dialog is
      // intentionally kept up — it visually covers the handoff.
      if (body?.actionRequired?.redirectUrl && body.id) {
        setResult(body);
        try {
          const entry: PendingPaymentSessionEntry = {
            payment_id: body.id,
            saved_at: Date.now(),
          };
          window.sessionStorage.setItem(
            PENDING_PAYMENT_SESSION_KEY,
            JSON.stringify(entry),
          );
        } catch {
          // sessionStorage disabled / quota exceeded — the SPA falls back to
          // reading `?paymentId=` from the return URL if available.
        }
        window.location.assign(body.actionRequired.redirectUrl);
        return;
      }
```

- [ ] **Step 4: Verify no other `order_id` references remain in the file**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && grep -n "order_id" src/hooks/useCheckoutPayment.ts || echo "CLEAN"`
Expected: `CLEAN`

- [ ] **Step 5: Rewrite `src/hooks/useThankYouPayment.ts`** — full replacement. Keys off `payment_id`, exposes the embedded receipt `context`, and passes `context_token` into `/issue-token`.

```ts
/**
 * useThankYouPayment
 * -----------------------------------------------------------------------------
 * Drives the thank-you page's "is the payment done yet?" lifecycle for the
 * stateless checkout.
 *
 * Inputs: a canonical `?token=<jwt>` from the URL, and an optional
 * `paymentIdHint` (a `?paymentId=` query param ConvesioPay may append on a 3DS
 * return, or the value stashed in sessionStorage by `useCheckoutPayment`).
 *
 * Flow:
 *   1. With a `token`, POST `/verify-token` to decode it. The decoded body
 *      includes the receipt context (items/shipping/customer) the worker
 *      embedded at `/payments` time.
 *      - `payment_id` present → normal thank-you token: verify + poll.
 *      - `payment_id` empty   → the "marker" token from the 3DS return URL.
 *        Resume via step 2 (the context is retained for the receipt).
 *   2. Resume: take the `payment_id` from the `?paymentId=` param or the
 *      sessionStorage bridge, POST `/issue-token` (passing the marker token as
 *      `context_token` so the receipt survives), rewrite the URL to
 *      `?token=<jwt>`, then verify + poll as normal.
 *   3. Terminal status → done. "Pending" → poll `/poll-payment` every 5s with
 *      `{ payment_id }` until terminal.
 * -----------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";

import {
  PENDING_PAYMENT_MAX_AGE_MS,
  PENDING_PAYMENT_SESSION_KEY,
  type PendingPaymentSessionEntry,
} from "@/hooks/useCheckoutPayment";

export type ThankYouState = "verifying" | "pending" | "succeeded" | "failed";

export interface CheckoutTokenPayload {
  payment_id: string;
  customer_id: string;
  order_number: string;
  status: string;
}

export interface ShippingAddress {
  houseNumberOrName: string;
  street: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
}

/** Aggregated line item embedded in the thank-you JWT. Amounts are in minor
 *  units (cents). */
export interface OrderLineItem {
  sku: string;
  description: string;
  quantity: number;
  amountMinor: number;
}

/** Receipt context decoded from the verified token. */
export interface OrderContext {
  order_number: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  items: OrderLineItem[];
}

export interface UseThankYouPaymentOptions {
  token: string | null;
  paymentIdHint: string | null;
}

export interface UseThankYouPaymentResult {
  state: ThankYouState;
  payload: CheckoutTokenPayload | null;
  context: OrderContext | null;
  error: Error | null;
}

type VerifyTokenResponseBody = CheckoutTokenPayload &
  Partial<OrderContext> & {
    error?: boolean;
    message?: string;
  };

function orderContextFromVerifyBody(
  body: VerifyTokenResponseBody,
): OrderContext {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: OrderLineItem[] = rawItems.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      sku: String(r.sku ?? ""),
      description: String(r.description ?? ""),
      quantity: Number(r.quantity ?? 1),
      amountMinor: Number(r.amountMinor ?? 0),
    };
  });
  return {
    order_number: body.order_number ?? "",
    customer_email: body.customer_email ?? null,
    customer_name: body.customer_name ?? null,
    customer_phone: body.customer_phone ?? null,
    shipping_address: body.shipping_address ?? null,
    items,
  };
}

// Intentionally duplicated in useCheckoutPayment.ts and
// worker/handlers/payments/shared.ts — the SPA and worker bundle separately.
const SUCCESS_STATUSES = new Set(["Succeeded", "Authorized"]);
const PENDING_STATUSES = new Set(["Pending"]);

const POLL_INTERVAL_MS = 5000;

function classify(status: string | undefined): ThankYouState {
  if (status && SUCCESS_STATUSES.has(status)) return "succeeded";
  if (status && PENDING_STATUSES.has(status)) return "pending";
  return "failed";
}

function readPendingPaymentHint(): PendingPaymentSessionEntry | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(PENDING_PAYMENT_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { payment_id?: unknown }).payment_id !== "string" ||
    !(parsed as { payment_id: string }).payment_id
  ) {
    return null;
  }

  const entry = parsed as PendingPaymentSessionEntry;

  if (
    typeof entry.saved_at === "number" &&
    Date.now() - entry.saved_at > PENDING_PAYMENT_MAX_AGE_MS
  ) {
    try {
      window.sessionStorage.removeItem(PENDING_PAYMENT_SESSION_KEY);
    } catch {
      // ignore
    }
    return null;
  }

  return entry;
}

function clearPendingPaymentHint(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_PAYMENT_SESSION_KEY);
  } catch {
    // ignore
  }
}

function promoteTokenToUrl(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("token", token);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore — URL rewriting is purely cosmetic
  }
}

export function useThankYouPayment(
  options: UseThankYouPaymentOptions,
): UseThankYouPaymentResult {
  const { token: initialToken, paymentIdHint } = options;

  const [state, setState] = useState<ThankYouState>(() => {
    if (initialToken) return "verifying";
    if (paymentIdHint) return "verifying";
    if (readPendingPaymentHint()) return "verifying";
    return "failed";
  });
  const [payload, setPayload] = useState<CheckoutTokenPayload | null>(null);
  const [context, setContext] = useState<OrderContext | null>(null);
  const [error, setError] = useState<Error | null>(() => {
    if (initialToken) return null;
    if (paymentIdHint) return null;
    if (readPendingPaymentHint()) return null;
    return new Error("Missing confirmation token.");
  });

  const payloadRef = useRef<CheckoutTokenPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const poll = async () => {
      const current = payloadRef.current;
      if (!current) return;

      let response: Response;
      try {
        response = await fetch("/poll-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ payment_id: current.payment_id }),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("failed");
        stopPolling();
        return;
      }

      let body: { status?: string; error?: boolean; message?: string } | null =
        null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!response.ok || body?.error) {
        setError(
          new Error(
            body?.message ??
              `Payment status check failed (${response.status} ${response.statusText})`,
          ),
        );
        setState("failed");
        stopPolling();
        return;
      }

      const next = classify(body?.status);
      if (next === "pending") return; // keep polling
      setState(next);
      if (next === "failed") {
        setError(new Error(`Payment ${(body?.status ?? "failed").toLowerCase()}.`));
      }
      stopPolling();
    };

    const verifyToken = async (tokenToVerify: string) => {
      let response: Response;
      try {
        response = await fetch("/verify-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ token: tokenToVerify }),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("failed");
        return;
      }

      let body: VerifyTokenResponseBody | null = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!response.ok || body?.error || !body) {
        setError(
          new Error(
            body?.message ??
              `Could not verify confirmation token (${response.status} ${response.statusText})`,
          ),
        );
        setState("failed");
        return;
      }

      const decoded: CheckoutTokenPayload = {
        payment_id: body.payment_id,
        customer_id: body.customer_id,
        order_number: body.order_number,
        status: body.status,
      };

      // Retain the embedded receipt context for the summary, regardless of
      // which branch we take next.
      setContext(orderContextFromVerifyBody(body));

      // Marker token from the 3DS return URL: no `payment_id` yet. Resolve one
      // and swap for a real token, passing this marker as `context_token` so
      // the new token keeps the receipt.
      if (!decoded.payment_id) {
        const hint =
          paymentIdHint ?? readPendingPaymentHint()?.payment_id ?? null;
        if (!hint) {
          setError(
            new Error("Could not resolve a payment id to resume verification."),
          );
          setState("failed");
          return;
        }
        await resumeFromPaymentId(hint, tokenToVerify);
        return;
      }

      payloadRef.current = decoded;
      setPayload(decoded);

      const next = classify(decoded.status);
      setState(next);

      if (next === "pending") {
        void poll();
        intervalId = setInterval(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      }
    };

    const resumeFromPaymentId = async (
      paymentId: string,
      contextToken: string | null,
    ) => {
      let response: Response;
      try {
        response = await fetch("/issue-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            payment_id: paymentId,
            context_token: contextToken ?? undefined,
          }),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("failed");
        return;
      }

      let body: { token?: string; error?: boolean; message?: string } | null =
        null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!response.ok || body?.error || !body?.token) {
        setError(
          new Error(
            body?.message ??
              `Could not resume payment verification (${response.status} ${response.statusText})`,
          ),
        );
        setState("failed");
        return;
      }

      promoteTokenToUrl(body.token);
      clearPendingPaymentHint();

      await verifyToken(body.token);
    };

    (async () => {
      if (initialToken) {
        await verifyToken(initialToken);
        return;
      }

      const hint = paymentIdHint ?? readPendingPaymentHint()?.payment_id ?? null;
      if (hint) {
        await resumeFromPaymentId(hint, null);
        return;
      }

      if (cancelled) return;
      setState("failed");
      setError(new Error("Missing confirmation token."));
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [initialToken, paymentIdHint]);

  return { state, payload, context, error };
}
```

- [ ] **Step 6: Rewrite `src/pages/ThankYouPage.tsx`** — remove the upsell banner/modal and `refreshOrderContext`; read `?paymentId=` instead of `?orderId=`; build the order number from `payload.order_number`; drop the `chargePending` UI.

```tsx
/**
 * ThankYouPage
 * -----------------------------------------------------------------------------
 * Landing page after the checkout redirects. Reads the `?token=` JWT the worker
 * signed on success/pending, verifies it server-side, and drives a state
 * machine via `useThankYouPayment`:
 *
 *   - "verifying" / "pending" — amber processing banner + spinner; the hook
 *     polls `/poll-payment` every 5s until the upstream status flips.
 *   - "succeeded" — forest "Order Confirmed" banner + receipt sidebar built
 *     from the line items embedded in the verified token.
 *   - "failed" — single failure card pointing back to the checkout.
 * -----------------------------------------------------------------------------
 */

import { useSearchParams } from "react-router";

import { Icon } from "@/components/icons";
import { PriceRow } from "@/components/checkout/primitives/PriceRow";
import { SectionCard } from "@/components/checkout/primitives/SectionCard";
import { useThankYouPayment } from "@/hooks/useThankYouPayment";
import { Spinner } from "@/components/ui/spinner";

// Product shown in the receipt when no order items are present in the token.
const PRODUCT = {
  name: "Daily Greens Complex",
  sku: "1234567890",
  salePrice: "$49.00",
  image: { src: "/product-summary-image.jpeg", alt: "Daily Greens Complex product photo" },
};

const SUMMARY = {
  includedProductsTitle: "Included Products",
  includedProductSuffix: "",
  shipping: { id: "shipping", label: "Shipping", value: "$7.95" },
  tax: { id: "tax", label: "Tax", value: "$0.00" },
  total: { id: "total", label: "Total", value: "$56.95" },
  currency: "USD",
};

const THANK_YOU = {
  nextSteps: { title: "What Happens Next" },
  receipt: {
    title: "Receipt Summary",
    backToHomeLabel: "Return to store",
    backToHomeHref: "/",
    guaranteeNote: "Your 60-day return window starts from the purchase date.",
  },
};

// Map known SKUs back to display copy + thumbnail.
const SKU_DISPLAY: Record<
  string,
  { name: string; image: { src: string; alt: string } }
> = {
  [PRODUCT.sku]: {
    name: PRODUCT.name,
    image: PRODUCT.image,
  },
};

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function ThankYouPage() {
  const product = PRODUCT;
  const summary = SUMMARY;
  const thankYou = THANK_YOU;

  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const paymentIdHint = searchParams.get("paymentId");
  const { state, payload, context, error } = useThankYouPayment({
    token,
    paymentIdHint,
  });

  const isFailed = state === "failed";
  const isProcessing = state === "pending" || state === "verifying";
  const orderNumber = payload?.order_number
    ? `#${payload.order_number}`
    : "#CV-302948";
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const paymentStatus = isProcessing
    ? "Pending — final review in progress"
    : "Paid — preparing shipment";
  const mainCardTitle = isProcessing
    ? "Processing Your Payment"
    : "Thank You for Your Order";
  const mainCardSubtitle = isProcessing
    ? "Hang tight — your payment is going through a final review. This page will update automatically as soon as it clears."
    : "Your payment was processed successfully.";
  const includedLabel = `${product.name}${summary.includedProductSuffix ? ` ${summary.includedProductSuffix}` : ""}`;

  const orderItems = context?.items ?? [];
  const hasOrderItems = orderItems.length > 0;
  const receiptCurrency = summary.currency || "USD";
  const itemsSubtotalMinor = orderItems.reduce(
    (sum, item) => sum + (item.amountMinor ?? 0),
    0,
  );
  const formattedTotal = hasOrderItems
    ? formatMoney(itemsSubtotalMinor, receiptCurrency)
    : summary.total.value;

  const ctaClassName =
    "cta w-full h-12 flex items-center justify-center gap-2 text-[13px] tracking-[0.28em] uppercase cursor-pointer";

  return (
    <main data-page="thank-you">
      <div className="max-w-[1180px] mx-auto flex w-full flex-col gap-4 px-5 py-8">
        {isFailed ? (
          <SectionCard
            section="thank-you-failure"
            title="We couldn't confirm your payment"
          >
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rust/10 text-rust">
                <Icon.Alert className="h-6 w-6" />
              </div>
              <p className="text-[13.5px] text-ink2">
                {error?.message ??
                  "Your payment could not be confirmed. You haven't been charged — please try checking out again."}
              </p>
              <a
                href="/"
                className="cta inline-flex h-11 items-center justify-center px-6 text-[13px] tracking-[0.28em] uppercase cursor-pointer"
              >
                Return to checkout
              </a>
            </div>
          </SectionCard>
        ) : (
          <>
            {isProcessing ? (
              <section
                data-section="promo-banner"
                data-status={state}
                aria-label="Payment processing message"
                aria-live="polite"
                className="flex items-start gap-3 border border-line bg-bone2 px-5 py-4"
              >
                <Spinner aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber2" />
                <div data-slot="promo-copy" className="space-y-1">
                  <p className="text-[15px] font-semibold text-ink">Processing Payment</p>
                  <p className="text-[13px] text-ink2">
                    We've received your payment and it's going through a final review. No need to
                    pay again — we'll confirm here as soon as it clears.
                  </p>
                </div>
              </section>
            ) : (
              <section
                data-section="promo-banner"
                data-status="succeeded"
                aria-label="Order confirmation message"
                className="flex items-start gap-3 border border-line bg-paper px-5 py-4"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-forest">
                  <Icon.Check className="h-3 w-3" />
                </span>
                <div data-slot="promo-copy" className="space-y-1">
                  <p className="text-[15px] font-semibold text-ink">Order Confirmed</p>
                  <p className="text-[13px] text-ink2">
                    Your checkout is complete and your confirmation email is on the way.
                  </p>
                </div>
              </section>
            )}

            <div
              data-section="thank-you-layout"
              className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start"
            >
              <section data-region="thank-you-main" className="flex flex-col gap-4">
                <SectionCard
                  section="thank-you-main-card"
                  data-status={state}
                  title={mainCardTitle}
                  titleClassName="text-[30px] leading-[1.05]"
                >
                  <p className="text-[13.5px] text-ink2">{mainCardSubtitle}</p>

                  <section className="mt-2 rule pt-4">
                    <h3 className="text-[15px] font-semibold tracking-tight text-ink">Order Details</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <p data-slot="order-label" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink3">
                          Order Number
                        </p>
                        <p data-slot="order-number" className="mt-1 num text-[13.5px] text-ink">{orderNumber}</p>
                      </div>
                      <div>
                        <p data-slot="date-label" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink3">
                          Date
                        </p>
                        <p data-slot="order-date" className="mt-1 text-[13.5px] text-ink2">{formattedDate}</p>
                      </div>
                      <div>
                        <p data-slot="status-label" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink3">
                          Status
                        </p>
                        <p data-slot="order-status" className="mt-1 text-[13.5px] text-ink2">{paymentStatus}</p>
                      </div>
                    </div>
                  </section>

                  <section className="mt-2 rule pt-4">
                    <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                      {thankYou.nextSteps.title}
                    </h3>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p data-slot="shipment-label" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink3">
                          Shipment
                        </p>
                        <p data-slot="shipment-value" className="mt-1 text-[13.5px] text-ink2">
                          You will receive a tracking email within 24 hours.
                        </p>
                      </div>
                      <div>
                        <p data-slot="support-label" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink3">
                          Support
                        </p>
                        <p data-slot="support-value" className="mt-1 text-[13.5px] text-ink2">
                          Need help? Reply to your confirmation email for priority support.
                        </p>
                      </div>
                    </div>
                  </section>
                </SectionCard>
              </section>

              <aside data-region="thank-you-summary" className="lg:sticky lg:top-[88px] lg:h-max">
                <SectionCard section="receipt-summary" title={thankYou.receipt.title}>
                  <div
                    data-slot="included-products-list"
                    className="border border-line bg-bone2 p-2.5"
                  >
                    {hasOrderItems ? (
                      orderItems.map((item) => {
                        const display = SKU_DISPLAY[item.sku];
                        const label = display?.name ?? item.description;
                        const image = display?.image ?? product.image;
                        const lineLabel =
                          item.quantity > 1 ? `${label} × ${item.quantity}` : label;
                        return (
                          <div
                            key={item.sku}
                            data-slot="included-product-item"
                            className="my-[7px] flex items-center gap-2.5 text-[13px]"
                          >
                            <img
                              data-slot="included-product-thumb"
                              src={image.src}
                              alt={image.alt}
                              className="h-12 w-12 shrink-0 border border-line object-cover"
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-ink">
                              <span>{lineLabel}</span>
                            </span>
                            <strong data-slot="included-product-price" className="num shrink-0 text-ink">
                              {formatMoney(item.amountMinor, receiptCurrency)}
                            </strong>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        data-slot="included-product-item"
                        className="my-[7px] flex items-center gap-2.5 text-[13px]"
                      >
                        <img
                          data-slot="included-product-thumb"
                          src={product.image.src}
                          alt={product.image.alt}
                          className="h-12 w-12 shrink-0 border border-line object-cover"
                        />
                        <span className="flex-1 text-ink">{includedLabel}</span>
                        <strong data-slot="included-product-price" className="num text-ink">
                          {product.salePrice}
                        </strong>
                      </div>
                    )}
                  </div>

                  <div
                    data-slot="included-products-title"
                    className="mt-1 text-[13px] font-bold text-forest"
                  >
                    {summary.includedProductsTitle}
                  </div>

                  <div className="flex flex-col gap-2">
                    {hasOrderItems ? (
                      orderItems.map((item) => {
                        const display = SKU_DISPLAY[item.sku];
                        const label = display?.name ?? item.description;
                        const lineLabel =
                          item.quantity > 1 ? `${label} × ${item.quantity}` : label;
                        return (
                          <PriceRow
                            key={item.sku}
                            data-slot="product-line"
                            line={{
                              id: `item-${item.sku}`,
                              label: lineLabel,
                              value: formatMoney(item.amountMinor, receiptCurrency),
                            }}
                            className="my-2 text-[14px]"
                            labelClassName="text-ink2"
                            valueClassName="font-bold text-ink"
                          />
                        );
                      })
                    ) : (
                      <PriceRow
                        data-slot="product-line"
                        line={{
                          id: "product",
                          label: product.name,
                          value: product.salePrice,
                        }}
                        className="my-2 text-[14px]"
                        labelClassName="text-ink2"
                        valueClassName="font-bold text-ink"
                      />
                    )}
                    <PriceRow
                      data-slot="shipping-line"
                      line={summary.shipping}
                      className="my-2 text-[14px]"
                      labelClassName="text-ink2"
                    />
                    <PriceRow
                      data-slot="tax-line"
                      line={summary.tax}
                      className="my-2 text-[14px]"
                      labelClassName="text-ink2"
                    />
                    <PriceRow
                      data-slot="total-line"
                      line={{
                        id: "total",
                        label: summary.total.label,
                        value: formattedTotal,
                      }}
                      className="mt-3 border-t border-line pt-3 text-[20px]"
                      labelClassName="font-semibold text-ink uppercase tracking-[0.1em] text-[12px]"
                      valueClassName="text-[22px] font-semibold text-ink"
                    />

                    <a href={thankYou.receipt.backToHomeHref} data-slot="cta-primary" className={ctaClassName}>
                      {thankYou.receipt.backToHomeLabel}
                    </a>

                    <div
                      data-slot="guarantee-note"
                      className="border border-line p-3 text-[12.5px] text-ink2"
                    >
                      {thankYou.receipt.guaranteeNote}
                    </div>
                  </div>
                </SectionCard>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
```

Then delete the now-unreferenced upsell components (they depend on the changed hook types):

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git rm src/components/thank-you/UpsellOfferBanner.tsx src/components/thank-you/UpsellCheckoutModal.tsx
```

- [ ] **Step 7: Rewrite `src/layouts/ShopLayout.tsx`** — drop the auth strip.

```tsx
import { Outlet } from "react-router";

import { SiteFooter, SiteHeader } from "@/components/site";
import { UrgencyRail } from "@/components/site/UrgencyRail";

export function ShopLayout() {
  return (
    <div className="min-h-dvh flex flex-col bg-bone text-ink">
      <UrgencyRail />
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 8: Rewrite `src/App.tsx`** — two routes; drop React Query, auth, and admin routes.

```tsx
import { BrowserRouter, Route, Routes } from "react-router";

import { CheckoutPage } from "@/pages/CheckoutPage";
import { ThankYouPage } from "@/pages/ThankYouPage";
import { ShopLayout } from "./layouts/ShopLayout";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ShopLayout />}>
          <Route index element={<CheckoutPage />} />
          <Route path="thank-you" element={<ThankYouPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 9: Build to verify the rewired entry points compile** (dead admin files still present but valid)

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npm run build`
Expected: build succeeds (no type errors). If a dead admin file errors because it imported something now changed, that's unexpected — note it; it should not, since no changed module is imported by admin code.

- [ ] **Step 10: Commit**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git add -A src
git commit -m "refactor(spa): rewire checkout + thank-you to stateless payment_id model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Delete dead front-end code and prune dependencies

**Files:**
- Delete: admin/auth/upsell front-end (see commands).
- Modify: `package.json`

- [ ] **Step 1: Delete the dead front-end files**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git rm -r src/components/orders src/components/users src/components/dashboard \
          src/components/settings src/components/login src/components/auth \
          src/providers src/context src/query-options src/mutation-options
git rm src/components/site/LoggedInBar.tsx \
       src/components/ui/drawer.tsx \
       src/pages/OrderPage.tsx src/pages/UsersPage.tsx src/pages/LoginPage.tsx \
       src/layouts/DashboardLayout.tsx \
       src/hooks/useAuth.ts src/hooks/useOrders.ts src/hooks/useUsers.ts src/hooks/useOrderDrawer.ts \
       src/lib/orders.ts src/lib/users.ts \
       src/utils/orders.ts
```

Note: `src/providers/` contained only Auth/Orders/Users/OrderDrawer providers, and `src/context/` only their contexts — both directories are removed wholesale. If a non-removed file remains in either, restore it instead of deleting the directory.

- [ ] **Step 2: Confirm nothing live still imports a deleted module**

Run:
```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
grep -rnE "providers/(Auth|Orders|Users|OrderDrawer)|context/(auth|orders|users|orderDrawer)|hooks/use(Auth|Orders|Users|OrderDrawer)|components/(orders|users|dashboard|settings|login|auth)|LoggedInBar|Upsell(Offer|Checkout)|ui/drawer|lib/(orders|users)|query-options|mutation-options|utils/orders|@tanstack/react-query" src
```
Expected: no output. If anything prints, fix that importer before continuing.

- [ ] **Step 3: Prune `package.json`** — remove DB/admin-only dependencies and the `db:migrate` scripts, and fix the `name`. Apply these edits:

Change the `name` field:
```json
  "name": "checkout-funnel-v3",
```

Remove these two `scripts` lines:
```json
    "db:migrate": "wrangler d1 migrations apply fulfillment-checkout-v2 --local",
    "db:migrate:remote": "wrangler d1 migrations apply fulfillment-checkout-v2 --remote",
```

Remove these `dependencies` lines:
```json
    "@tanstack/react-query": "^5.100.5",
    "drizzle-orm": "^0.45.2",
    "vaul": "^1.1.2",
```

Remove this `devDependencies` line:
```json
    "drizzle-kit": "^0.31.10",
```

- [ ] **Step 4: Reinstall to update the lockfile**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npm install`
Expected: completes; `package-lock.json` updated, no errors.

- [ ] **Step 5: Build and lint**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npm run build && npm run lint`
Expected: both succeed with no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git add -A
git commit -m "refactor(spa): delete admin/auth/orders/users/upsell UI and prune deps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Strip Cloudflare config and environment files

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `.dev.vars`, `.env`, `.env.example`

- [ ] **Step 1: Rewrite `wrangler.jsonc`** — remove the D1 binding, the cron trigger, and the admin `run_worker_first` paths; restore the required secrets.

```jsonc
/**
 * For more details on how to configure Wrangler, refer to:
 * https://developers.cloudflare.com/workers/wrangler/configuration/
 */
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "checkout-funnel-v3",
	"main": "worker/index.ts",
	"compatibility_date": "2026-04-22",
	"assets": {
		"not_found_handling": "single-page-application",
		"run_worker_first": [
			"/config",
			"/payments",
			"/verify-token",
			"/issue-token",
			"/poll-payment"
		]
	},
	"observability": {
		"enabled": true
	},
	"upload_source_maps": true,
	"compatibility_flags": [
		"nodejs_compat"
	],
	"secrets": {
		"required": ["CPAY_API_KEY", "CPAY_SECRET", "CPAY_INTEGRATION"]
	},
	"vars": {
		"CPAY_ENVIRONMENT": "test"
	}
}
```

Note on `name`: this changes the deploy target Worker name to `checkout-funnel-v3` (approved). If an existing deployed Worker named `fulfillment-checkout-v3` must be preserved, keep the old `name` instead — but the approved default is to rename.

- [ ] **Step 2: Rewrite `.env.example`** — keep only the CPAY variables.

```
# ConvesioPay credentials (set these as Worker secrets in production)
CPAY_API_KEY=
CPAY_SECRET=
CPAY_INTEGRATION=

# Upstream environment: "test" (sandbox) or "live"
CPAY_ENVIRONMENT=test
```

- [ ] **Step 3: Strip removed secrets from `.dev.vars` and `.env`**

Run:
```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
for f in .dev.vars .env; do
  [ -f "$f" ] && grep -vE "^(AUTH_SALT|GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET|SENDGRID_API_KEY|CARTROVER_API_USER|CARTROVER_API_KEY)=" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
echo "--- .dev.vars ---"; cat .dev.vars 2>/dev/null; echo "--- .env ---"; cat .env 2>/dev/null
```
Expected: only `CPAY_*` (and `CPAY_ENVIRONMENT`) lines remain. These files are gitignored — they won't be committed, but must be correct for local `wrangler dev`.

- [ ] **Step 4: Regenerate Worker types** (drops `DB` from the generated env)

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npm run cf-typegen`
Expected: `worker-configuration.d.ts` regenerated with no D1 binding. If `cf-typegen` requires Cloudflare auth and fails offline, skip — `worker/env.d.ts` already declares the needed `Env`; note the skip.

- [ ] **Step 5: Build to confirm config + types are consistent**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git add wrangler.jsonc .env.example worker-configuration.d.ts
git commit -m "chore: drop D1, cron, and admin routes from wrangler config; trim env

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Rewrite the README for a checkout-only project

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`** with a checkout-only document (editorial framing, no fulfillment/admin/cron/DB/OAuth/upsell content).

````markdown
# Convesio Editorial Checkout (v3)

A production-ready **single-page application** that renders an **integrated
ConvesioPay checkout** in an editorial, print-inspired visual style, ready to
deploy on [Convesio Static Sites](https://convesio.com). Ships as the fully
designed **"MERIDIAN — Daily Greens Complex"** supplement checkout demo.

It is **stateless**: there is no database and no order storage. The Cloudflare
Worker proxies payment calls to ConvesioPay server-side (so your API keys never
leave the server), signs a tamper-evident JWT carrying the receipt details, and
polls ConvesioPay for the final status. **ConvesioPay is the single source of
truth.**

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4** and
**shadcn/ui**, served from a **Cloudflare Worker**.

---

## How it Works

```text
                 ┌────────────────────────┐
                 │   Browser (SPA)        │
                 │   React + ConvesioPay  │
                 │   iframe SDK           │
                 └───────────┬────────────┘
                             │  1. GET  /config        (public client key)
                             │  2. POST /payments      (tokenized card)
                             │  3. POST /verify-token  (decode thank-you JWT)
                             │  4. POST /issue-token   (mint JWT after 3DS)
                             │  5. POST /poll-payment  (poll payment status)
                             ▼
                 ┌────────────────────────┐
                 │  Cloudflare Worker     │
                 │  worker/index.ts       │
                 │  Holds CPAY_SECRET +   │
                 │  CPAY_API_KEY          │
                 └───────────┬────────────┘
                             │  Signed, server-to-server
                             ▼
                 ┌────────────────────────┐
                 │  ConvesioPay API       │
                 │  sandbox  /  live      │
                 └────────────────────────┘
```

1. **Card tokenization** — the browser loads the ConvesioPay SDK iframe
   (`/config` returns the public client key) and tokenizes the card client-side;
   raw card data never touches the Worker.
2. **Payment** (`POST /payments`) — the Worker forwards the tokenized card to
   ConvesioPay and, on success/pending, signs a **JWT** carrying the payment id,
   line items, shipping, and customer, then redirects to `/thank-you?token=…`.
3. **3D Secure** — if the issuer requires a challenge, the Worker pre-signs a
   *marker* JWT into the `returnUrl`. On return the SPA mints the real JWT via
   `/issue-token` (preserving the receipt context) and continues.
4. **Async polling** — payments in a `Pending` state are polled every 5 seconds
   via `/poll-payment` until a terminal status is received.

There is no database, no admin dashboard, no scheduled jobs, and no external
fulfillment/email integration — just the checkout.

## Environment Variables

Set these as **Worker secrets** in production (and in `.dev.vars` locally):

| Variable           | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `CPAY_API_KEY`     | Public client key returned to the browser SDK      |
| `CPAY_SECRET`      | Secret key for server-to-server ConvesioPay calls  |
| `CPAY_INTEGRATION` | ConvesioPay integration id                         |
| `CPAY_ENVIRONMENT` | `test` (sandbox) or `live` — plain var, not secret |

## Local Development

```bash
npm install            # install dependencies
# put CPAY_* into .dev.vars (see .env.example)
npm run dev            # start the Vite + Worker dev server
```

## Available Scripts

| Script             | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the local dev server                   |
| `npm run build`    | Type-check and build for production          |
| `npm run lint`     | Run ESLint                                   |
| `npm run preview`  | Build then preview the production bundle      |
| `npm run deploy`   | Build and deploy to Cloudflare               |
| `npm run cf-typegen` | Regenerate Worker types from `wrangler.jsonc` |
| `npm run add-envs` | Prompt to set the three CPAY Worker secrets   |

## Customization

- **Copy, prices, images** — edit the section components under
  `src/components/checkout/` and `src/components/thank-you/`; bundles live in
  `src/components/checkout/bundles.ts`.
- **Brand tokens** — `src/index.css`.

## Testing the Checkout

In `test` mode, use ConvesioPay's sandbox test cards to exercise the success,
pending, and 3DS flows. Switch `CPAY_ENVIRONMENT` to `live` (with live
credentials) when ready to go live.
````

- [ ] **Step 2: Commit**

```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
git add README.md
git commit -m "docs: rewrite README for the stateless checkout-only project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Final end-to-end verification

No code changes — this task proves the converted app works.

- [ ] **Step 1: Clean build + lint**

Run: `cd /home/albert/Documents/Convesio/checkout-funnel-v3 && npm run build && npm run lint`
Expected: both pass, zero errors/warnings.

- [ ] **Step 2: Confirm the app surface is checkout-only**

Run:
```bash
cd /home/albert/Documents/Convesio/checkout-funnel-v3
grep -rnE "drizzle|@tanstack/react-query|cartrover|sendgrid|/orders|/login|ProtectedRoute|scheduled\(" src worker package.json wrangler.jsonc || echo "CLEAN"
```
Expected: `CLEAN`.

- [ ] **Step 3: Start the dev server** (preview tools)

Use `preview_start` for this project. Confirm it boots without errors via `preview_logs`.

- [ ] **Step 4: Exercise the checkout in the browser** (preview tools)

- `preview_snapshot` on `/` — confirm the editorial checkout renders (hero, bundle selector, ingredients, reviews, guarantee, the customer/shipping/payment form).
- Fill the form (`preview_fill`), select a multi-bottle bundle, and submit with a ConvesioPay **sandbox success** test card.
- Confirm redirect to `/thank-you` and that the receipt sidebar shows the **purchased bundle** quantity/price (proving the JWT-embedded receipt works), with order number, date, and "Order Confirmed".
- `preview_console_logs` and `preview_network` — confirm no errors and that the calls hit `/payments`, `/verify-token`, and (if pending) `/poll-payment`.

- [ ] **Step 5: Capture proof**

`preview_screenshot` of the thank-you page with the populated receipt. Report build/lint output and the screenshot to the user.

- [ ] **Step 6 (note):** The 3DS resume path requires a sandbox card that triggers a bank challenge. If such a card is available, verify the return lands on `/thank-you`, promotes to `?token=`, and the receipt still shows the items. If no 3DS test card is available, note that this path was verified by code inspection only.

---

## Self-Review Notes (for the executor)

- **Status-set duplication:** `SUCCESS_STATUSES` / `PENDING_STATUSES` are intentionally duplicated across `worker/handlers/payments/shared.ts`, `src/hooks/useCheckoutPayment.ts`, and `src/hooks/useThankYouPayment.ts` (separate bundles). Keep them identical.
- **Type names are consistent across tasks:** worker `CheckoutTokenPayload` / `ReceiptLineItem` (jose) vs. the SPA's own `CheckoutTokenPayload` / `OrderLineItem` / `OrderContext` are deliberately separate declarations in separately-bundled code — they are not imported across the boundary.
- **`context_token`** is the only addition to the `/issue-token` contract; the SPA always sends it when resuming from a marker, and the worker treats it as optional.
- **Receipt fallback:** if a token somehow lacks `items` (e.g. a 3DS resume where the marker was lost), the thank-you page renders the static `PRODUCT` line — never an empty receipt.
````

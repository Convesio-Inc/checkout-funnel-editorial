# Fulfillment Checkout

A storefront SPA + admin dashboard served by a single Cloudflare Worker. The worker proxies ConvesioPay, owns a D1 database, and runs a bi-hourly fulfillment cron that charges deferred upsells, pushes orders to CartRover, and sends confirmation emails via SendGrid.

This repo started from the public [SPA Checkout Template](https://github.com/Convesio-Inc/spa-checkout-template).

## Commands

```bash
npm run dev          # Vite dev server (SPA only — no worker, no /auth/*, /users, /orders)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run preview      # Build + serve through Wrangler (full worker environment, D1, cron)
npm run deploy       # Build + deploy to Cloudflare via Wrangler
npm run cf-typegen   # Regenerate Cloudflare bindings types from wrangler.jsonc
npm run add-envs     # Push all ConvesioPay + auth + integration secrets to Cloudflare
```

`npm run dev` does **not** start the worker, so any route under `/auth/*`, `/config`, `/payments`, `/upsell-payment`, `/list-orders`, `/search-orders`, `/users`, `/users/*`, or `/list-payments` will 404 — use `npm run preview` to exercise the full stack.

For local development with the worker, create a `.dev.vars` file at the project root with the secrets listed in [Worker secrets](#worker-secrets).

## Architecture

React 19 + TypeScript SPA (Vite) deployed as a **Cloudflare Worker** (`@cloudflare/vite-plugin`). The worker serves the SPA and exposes a single API surface that proxies ConvesioPay, manages staff users, lists orders, and queues deferred upsell charges — secrets never reach the browser.

- **Routing**: React Router 7 in `src/App.tsx`, wrapped in `AuthProvider` and `QueryClientProvider` (TanStack Query). Storefront routes live under `ShopLayout`; dashboard routes live under `DashboardLayout` and are gated by `ProtectedRoute`.
- **Data layer**: TanStack Query for dashboard data fetching/caching. Storefront state is local-only.
- **Persistence**: Cloudflare D1 (`DB` binding, db name `fulfillment-checkout-v2`). Queries go through Drizzle ORM (`worker/db/`).
- **Scheduled work**: A `0 */2 * * *` cron triggers `handleSyncPayments`, which reconciles pending payments, charges deferred upsells, syncs orders to CartRover, and emails customers.

### Frontend routes

| Path                            | Page           | Layout            | Auth                                             |
| ------------------------------- | -------------- | ----------------- | ------------------------------------------------ |
| `/`                             | `CheckoutPage` | `ShopLayout`      | public                                           |
| `/product`                      | `ProductPage`  | `ShopLayout`      | public                                           |
| `/thank-you`                    | `ThankYouPage` | `ShopLayout`      | public (`?token=` JWT or `?paymentId=` fallback) |
| `/login`                        | `LoginPage`    | standalone        | public                                           |
| `/orders`, `/orders/page/:page` | `OrderPage`    | `DashboardLayout` | `ProtectedRoute`                                 |
| `/settings/users`               | `UsersPage`    | `DashboardLayout` | `ProtectedRoute`                                 |

### Payment flow (end-to-end)

1. SPA loads → `useConvesioPayCheckout` calls `GET /config` on the worker → receives `{ apiKey, clientKey, environment }`.
2. Hook initializes the ConvesioPay SDK (injected via `<script>` in `index.html`) and mounts its iframe into a ref.
3. User fills customer + shipping fields; form state lives in `CheckoutPage`.
4. Submit → `component.createToken()` tokenizes the card → `useCheckoutPayment.pay()` POSTs to `POST /payments`.
5. Worker validates the payload, **pre-signs a "marker" JWT** (no `payment_id` — we don't have one yet) and bakes it into the outgoing `returnUrl` as `/thank-you?token=<marker>`. It then injects `CPAY_SECRET` / `CPAY_INTEGRATION` and proxies to ConvesioPay (sandbox or live based on `CPAY_ENVIRONMENT`).
6. On `Succeeded` / `Authorized` / `Pending`, the worker persists the order + payment to D1 (so the dashboard can list them and the upsell cron can pick them up), **signs a second HS256 JWT** (`worker/jwt.ts`, keyed on `CPAY_CLIENT_KEY`) carrying `{ payment_id, customer_id, order_number, status }`, and returns a `redirectUrl` of `/thank-you?token=<jwt>`. If the upstream response carries `actionRequired` (a 3DS / verify-customer challenge), the worker passes the body through untouched — the SPA handles the handoff itself, and the bank will later redirect the user back to the `returnUrl` containing the marker JWT. On any other status / error, it passes the upstream response straight through.
7. `useCheckoutPayment.pay()` keeps the processing dialog up and `window.location.assign()`s to the redirect URL. `PaymentStatusDialog` is now only surfaced for `processing` and `failed` — success / pending are owned by the thank-you page. On an `actionRequired` response, the hook stashes `{ payment_id, order_number }` in `sessionStorage[cpay_pending_payment]` before navigating the user to `actionRequired.redirectUrl`.
8. `ThankYouPage` + `useThankYouPayment` call `POST /verify-token` on mount, then, if the status is `Pending`, poll `POST /poll-payment` every 5s until the upstream status flips to terminal. Layout swaps between `verifying` / `pending` / `succeeded` / `failed` without a full re-layout. If the decoded JWT has an empty `payment_id` (the marker signed in step 5), the hook resolves the id from the `?paymentId=` URL param or the sessionStorage bridge, POSTs it to `/issue-token` to mint a proper JWT, then `history.replaceState`s the URL to `/thank-you?token=<jwt>` before running the normal verify + poll loop.

### Upsell flow (end-to-end)

The thank-you page offers a time-limited one-click upsell. Crucially, the charge is **deferred** — the worker queues it and the bi-hourly cron runs it. This intentional gap protects against issuer velocity rules and lets us bundle the upsell into the same fulfillment as the original order.

1. `ThankYouPage` reads the `UPSELL_PRODUCT` constant defined inline in `src/pages/ThankYouPage.tsx`. If the upsell SKU is not already in the order's line items, it mounts `UpsellOfferBanner` (countdown driven by `upsellProduct.upsellMinutes`). Set `UPSELL_PRODUCT` to `null` to disable the upsell banner entirely.
2. User clicks the offer → `UpsellCheckoutModal` opens. Confirming POSTs `{ order_id, amount, currency, lineItems }` to `/upsell-payment`.
3. `handleUpsellPayment` validates the order exists in D1 and has a `stored_payment_method_id`. It dedupes by first-SKU against existing `cpay_status='scheduled'` rows for that order, then inserts a fresh `scheduled` payment row carrying the latest payment's customer details, the line items JSON, `amount_minor`, and `currency`. It returns `{ deferred: true, alreadyQueued, order_id, message }` — **no upstream call yet**.
4. The modal closes; `ThankYouPage` invokes `onReceiptRefresh` (wired to `refreshOrderContext` from `useThankYouPayment`), which re-hits `/verify-token` so the new line item shows in the receipt with a "Charge pending" badge.
5. Every 2 hours, the `0 */2 * * *` cron runs `handleSyncPayments` (`worker/handlers/payments/sync-payments.ts`):
   - Selects orders with `crover_synced='pending'` **and** `created_at <= now - 2h` (the gap is the spacing that the deferred upsell relies on).
   - For each order, in order:
     1. `reconcilePendingPaymentsWithUpstreamForOrder` — re-polls ConvesioPay for any `cpay_status='pending'` rows and rewrites them to `success` / `failed` based on the upstream state.
     2. `chargeScheduledUpsellPaymentsForOrder` — for each `scheduled` row, POSTs a stored-card charge to ConvesioPay and rewrites the row's status (`pending` if upstream still working, otherwise `success` / `failed`).
     3. Builds a CartRover `createOrder` payload from the order's aggregated `items` JSON via `CartRoverService.createOrder`. On success, sets `crover_synced='synced'` and stores `crover_order_id`. On rejection, sets `crover_synced='failed'` and **re-throws** so Cloudflare retries the cron tick.
     4. Sends an order-confirmation email via `SendgridService.sendEmail`.

### Auth flow

Sessions are **opaque hex tokens** (not JWTs) stored in the `user_sessions` D1 table, with a 7-day TTL, and surfaced to the browser via the `fc_auth_session` HttpOnly+Secure cookie. The token-derivation salt is `AUTH_SALT`. Helpers live in `worker/handlers/auth/shared.ts`.

1. `AuthProvider` (`src/providers/AuthProvider.tsx`) hydrates the current user by calling `GET /auth/session` on mount; it exposes `useAuth()` to the app.
2. `LoginPage` either POSTs to `/auth/login` (email + password) or redirects to `/auth/google/start`. Google's callback hits `/auth/google/callback`, which exchanges the code, requires the email to already exist in the `users` table (returns `no_access` otherwise — Google OAuth is for already-provisioned staff), creates a session row, and sets `fc_auth_session`.
3. `ProtectedRoute` (`src/components/auth/ProtectedRoute.tsx`) gates dashboard routes; unauthenticated users get redirected to `/login`.
4. Every protected worker handler calls `readAuthenticatedSession(request, env)` from `worker/handlers/auth/shared.ts`. `POST /auth/logout` deletes the session row and clears the cookie via `clearSessionCookie()`.
5. Initial provisioning: `POST /auth/register` (email/password/name) seeds the first user. After that, staff are managed via the Users dashboard.

### Admin dashboard

- **Orders** (`/orders`, `/orders/page/:page`) — `OrderPage` renders a paginated table fed by `GET /list-orders` and (when searching) `GET /search-orders`. Clicking a row opens `OrderDrawer` (a side sheet) showing line items, customer info, and per-payment ConvesioPay status. State flows through `OrdersProvider` + `OrderDrawerProvider` + the `useOrders` / `useOrderDrawer` hooks. TanStack Query handles caching and pagination.
- **Users** (`/settings/users`) — `UsersPage` renders the staff CRUD UI. Roles are `owner` | `admin` | `member`. Only `admin` and `member` are creatable/assignable via `POST /users` and `PATCH /users/:id` (see `MANAGEABLE_USER_ROLES` in `worker/handlers/auth/shared.ts`) — `owner` is reserved and cannot be created, demoted, or deleted through the API.

### Key files

| File                                                                                                                                                                   | Role                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.css`                                                                                                                                                        | `/* === BRAND THEME === */` block — three `--brand*` tokens drive button color, hover, and text.                                                                                                                                                                                                          |
| `src/App.tsx`                                                                                                                                                          | Wraps the app in `AuthProvider` + `QueryClientProvider`, mounts `ShopLayout` (storefront) and `DashboardLayout` (admin) with `ProtectedRoute` on dashboard routes.                                                                                                                                        |
| `src/layouts/ShopLayout.tsx` / `src/layouts/DashboardLayout.tsx`                                                                                                       | Two top-level layouts — storefront vs admin.                                                                                                                                                                                                                                                              |
| `src/pages/CheckoutPage.tsx`                                                                                                                                           | Owns all checkout form state; wires `useConvesioPayCheckout` + `useCheckoutPayment`; drives `PaymentStatusDialog`.                                                                                                                                                                                        |
| `src/pages/ThankYouPage.tsx`                                                                                                                                           | Post-checkout landing driven by the `?token=` JWT; renders verifying / pending / succeeded / failed; mounts the upsell banner + modal when configured.                                                                                                                                                    |
| `src/pages/ProductPage.tsx`                                                                                                                                            | Optional product page mounted at `/product`.                                                                                                                                                                                                                                                              |
| `src/pages/LoginPage.tsx`                                                                                                                                              | Email/password + Google OAuth entry point.                                                                                                                                                                                                                                                                |
| `src/pages/OrderPage.tsx`                                                                                                                                              | Admin orders listing + drawer.                                                                                                                                                                                                                                                                            |
| `src/pages/UsersPage.tsx`                                                                                                                                              | Staff CRUD UI.                                                                                                                                                                                                                                                                                            |
| `src/hooks/useConvesioPayCheckout.ts`                                                                                                                                  | Config fetch → SDK init → iframe mount lifecycle; returns `{ component, isValid, status }`.                                                                                                                                                                                                               |
| `src/hooks/useCheckoutPayment.ts`                                                                                                                                      | State machine: `idle → processing → success / pending / failed`. On success/pending, hands off to the worker's `redirectUrl`. On 3DS `actionRequired`, stashes the payment id in sessionStorage and redirects to the challenge URL. Exports `PENDING_PAYMENT_SESSION_KEY` / `PENDING_PAYMENT_MAX_AGE_MS`. |
| `src/hooks/useThankYouPayment.ts`                                                                                                                                      | Thank-you state machine: verify JWT → poll `/poll-payment` every 5s while pending → resolve to succeeded/failed. Hydrates a JWT via `/issue-token` from `?paymentId=` or the sessionStorage bridge when needed. Exposes `refreshOrderContext` to re-pull the order after an upsell.                       |
| `src/hooks/useAuth.ts` / `src/hooks/useOrders.ts` / `src/hooks/useUsers.ts` / `src/hooks/useOrderDrawer.ts`                                                            | Dashboard data hooks; pair 1:1 with the matching context + provider.                                                                                                                                                                                                                                      |
| `src/providers/AuthProvider.tsx` / `OrdersProvider.tsx` / `UsersProvider.tsx` / `OrderDrawerProvider.tsx`                                                              | Context providers consumed by the dashboard pages.                                                                                                                                                                                                                                                        |
| `src/context/auth.ts` / `orders.ts` / `users.ts` / `orderDrawer.ts`                                                                                                    | Context shapes (e.g. `AuthUser = { id, email, name, role }`).                                                                                                                                                                                                                                             |
| `src/lib/convesiopay.ts`                                                                                                                                               | Module-level singletons: cached config promise + single SDK instance (never re-initialized).                                                                                                                                                                                                              |
| `src/lib/orders.ts` / `src/lib/users.ts`                                                                                                                               | Typed fetch wrappers for the dashboard APIs (return paginated lists with `X-Page` / `X-Total-Count` headers).                                                                                                                                                                                             |
| `src/components/thank-you/UpsellOfferBanner.tsx` / `UpsellCheckoutModal.tsx`                                                                                           | Upsell UI on the thank-you page. The modal POSTs to `/upsell-payment` and calls `onReceiptRefresh` on success.                                                                                                                                                                                            |
| `src/components/auth/ProtectedRoute.tsx`                                                                                                                               | Route gate — redirects to `/login` when no session.                                                                                                                                                                                                                                                       |
| `src/components/orders/*` / `src/components/users/*` / `src/components/dashboard/*` / `src/components/settings/*` / `src/components/login/*` / `src/components/site/*` | Section components for the dashboard surfaces.                                                                                                                                                                                                                                                            |
| `worker/index.ts`                                                                                                                                                      | Worker entry. Dispatches the full route table (auth / config / payments / orders / users / upsell-payment) and the scheduled handler.                                                                                                                                                                     |
| `worker/jwt.ts`                                                                                                                                                        | HS256 `signCheckoutToken` / `verifyCheckoutToken` helpers for the thank-you redirect token.                                                                                                                                                                                                               |
| `worker/db/client.ts` / `worker/db/schema.ts`                                                                                                                          | Drizzle client (`db(env)`) + schema for `users`, `user_sessions`, `orders`, `payments`.                                                                                                                                                                                                                   |
| `worker/db/payments.ts` / `worker/db/users.ts` / `worker/db/order-search.ts`                                                                                           | Drizzle query helpers reused across handlers.                                                                                                                                                                                                                                                             |
| `worker/services/cart-rover.ts` / `worker/services/sendgrid.ts`                                                                                                        | Thin REST clients for the two external integrations.                                                                                                                                                                                                                                                      |
| `worker/handlers/auth/*`                                                                                                                                               | 6 handlers (`register`, `login`, `logout`, `session`, `google-start`, `google-callback`) + `shared.ts` (session reader, cookie helpers, role guards).                                                                                                                                                     |
| `worker/handlers/orders/list-orders.ts` / `search-orders.ts`                                                                                                           | Auth-gated; back the dashboard orders table.                                                                                                                                                                                                                                                              |
| `worker/handlers/users/*`                                                                                                                                              | 6 handlers (`list-users`, `search-users`, `create-user`, `get-user`, `update-user`, `delete-user`) — all auth-gated.                                                                                                                                                                                      |
| `worker/handlers/payments/upsell-payment.ts`                                                                                                                           | Queues a `cpay_status='scheduled'` row; **does not charge**.                                                                                                                                                                                                                                              |
| `worker/handlers/payments/sync-payments.ts`                                                                                                                            | The cron entrypoint: reconcile → charge scheduled → push to CartRover → email.                                                                                                                                                                                                                            |
| `worker/handlers/payments/process-scheduled-upsells.ts`                                                                                                                | `chargeScheduledUpsellPaymentsForOrder` + `reconcilePendingPaymentsWithUpstreamForOrder` — both called by the cron.                                                                                                                                                                                       |
| `worker/handlers/payments/payment-status.ts`                                                                                                                           | `CPAY_STATUS_PENDING` / `SCHEDULED` / `SUCCESS` / `FAILED` constants and the doc comment describing the lifecycle.                                                                                                                                                                                        |
| `worker/handlers/payments/stored-card-charge.ts` / `apply-upstream-to-payment.ts` / `aggregate-items.ts`                                                               | Reusable building blocks for `payments.ts` + the cron.                                                                                                                                                                                                                                                    |
| `worker/handlers/payments/list-payments.ts`                                                                                                                            | Auth-gated; surfaces payments for an order in the dashboard drawer.                                                                                                                                                                                                                                       |

### Worker routes

| Method   | Path                    | Auth         | Purpose                                                                                                                                                                                                                                |
| -------- | ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/auth/register`        | public       | Seed/create a staff user (email + password + name).                                                                                                                                                                                    |
| `POST`   | `/auth/login`           | public       | Email/password login; sets `fc_auth_session`.                                                                                                                                                                                          |
| `GET`    | `/auth/google/start`    | public       | Redirect to Google OAuth (state + next-path cookies).                                                                                                                                                                                  |
| `GET`    | `/auth/google/callback` | public       | Exchange the code, require the email to already exist, set the session cookie.                                                                                                                                                         |
| `GET`    | `/auth/session`         | public       | Return the current user (or `null`) — hydrates `AuthProvider`.                                                                                                                                                                         |
| `POST`   | `/auth/logout`          | public       | Delete the session row and clear the cookie.                                                                                                                                                                                           |
| `GET`    | `/config`               | public       | Returns `{ apiKey, clientKey, environment }` to boot the browser SDK.                                                                                                                                                                  |
| `POST`   | `/payments`             | public (SPA) | Proxies to ConvesioPay's payments API. Pre-signs a marker JWT into the outgoing `returnUrl`. On success/pending, persists order + payment to D1 and signs the final thank-you JWT. On `actionRequired` (3DS), passes the body through. |
| `POST`   | `/upsell-payment`       | public (SPA) | Inserts a `cpay_status='scheduled'` row for a stored-card charge; returns `{ deferred: true }`. **Does not call ConvesioPay.**                                                                                                         |
| `POST`   | `/verify-token`         | public       | Verifies a thank-you redirect JWT and returns its decoded payload + current order context.                                                                                                                                             |
| `POST`   | `/issue-token`          | public       | Mints a fresh thank-you JWT for a `payment_id` (verified to exist upstream). Used by the thank-you page to recover from a 3DS return with no `?token=`.                                                                                |
| `POST`   | `/poll-payment`         | public       | Proxies `GET /v1/payments/:id` upstream so the thank-you page can poll a pending payment.                                                                                                                                              |
| `GET`    | `/list-orders`          | session      | Paginated orders for the dashboard.                                                                                                                                                                                                    |
| `GET`    | `/search-orders`        | session      | Order search for the dashboard.                                                                                                                                                                                                        |
| `GET`    | `/list-payments`        | session      | Payments for a given order (drawer).                                                                                                                                                                                                   |
| `GET`    | `/users`                | session      | Paginated staff list.                                                                                                                                                                                                                  |
| `GET`    | `/users/search`         | session      | Staff search.                                                                                                                                                                                                                          |
| `POST`   | `/users`                | session      | Create a staff user (role limited to `admin` or `member`).                                                                                                                                                                             |
| `GET`    | `/users/:id`            | session      | Fetch a single staff user.                                                                                                                                                                                                             |
| `PATCH`  | `/users/:id`            | session      | Update role/name (cannot demote or change an `owner`).                                                                                                                                                                                 |
| `DELETE` | `/users/:id`            | session      | Delete a staff user (cannot delete an `owner`).                                                                                                                                                                                        |
| cron     | `0 */2 * * *`           | —            | `handleSyncPayments`: reconcile pending → charge scheduled upsells → push to CartRover → email.                                                                                                                                        |

The `assets.run_worker_first` array in `wrangler.jsonc` lists the paths the worker handles before falling back to the static SPA; keep it in sync when adding routes.

### Worker secrets

Declared in `wrangler.jsonc` as `secrets.required` (Wrangler fails the deploy if any are missing) and typed in `worker/env.d.ts`:

- ConvesioPay: `CPAY_CLIENT_KEY`, `CPAY_API_KEY`, `CPAY_SECRET`, `CPAY_INTEGRATION`.
- Auth: `AUTH_SALT` — keys session-token derivation; rotating it logs everyone out.
- Google OAuth: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
- Email: `SENDGRID_API_KEY` — used by the cron to send order confirmations.
- Fulfillment: `CARTROVER_API_USER`, `CARTROVER_API_KEY` — used by the cron to create orders in CartRover.

Plain var: `CPAY_ENVIRONMENT` — `"test"` (default) or `"live"`. Selects the upstream host (`api.convesiopay.com` vs `api-qa.convesiopay.com`) — sandbox keys against live (or vice-versa) return a 401.

### D1 database

Binding `DB`, database name `fulfillment-checkout-v2` (id pinned in `wrangler.jsonc`). All queries go through Drizzle (`db(env)` in `worker/db/client.ts`). Schema in `worker/db/schema.ts`:

| Table           | Notes                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | `id`, `email` (unique), `passwordHash`, `name`, `role: 'owner' \| 'admin' \| 'member'` (default `member`).                                                                                                                        |
| `user_sessions` | `id`, `userId`, `token` (unique, opaque hex), `expiresAt`, `createdAt`. 7-day TTL.                                                                                                                                                |
| `orders`        | `id`, `crover_order_id`, `crover_synced: 'pending' \| 'synced' \| 'failed'`, `sent_email`, `shipping_info` (JSON), `items` (aggregated JSON), `stored_payment_method_id`, `created_at`.                                           |
| `payments`      | `id`, `order_id`, `cpay_id`, `cpay_status: 'pending' \| 'scheduled' \| 'success' \| 'failed'` (see `worker/handlers/payments/payment-status.ts`), customer fields, `line_items` (JSON), `amount_minor`, `currency`, `created_at`. |

Migrations live under `worker/db/migrations/`.

## Customization layers

Three layers in increasing depth — only go deeper than you need:

1. **Copy / prices / images** → edit the component or page directly. Every user-visible string, price and image lives inline in the file that renders it. Key locations:
   - Brand name, nav links → `src/components/site/SiteHeader.tsx`
   - Footer copy → `src/components/site/SiteFooter.tsx`
   - Checkout section headings, payment amount (`AMOUNT_MINOR`), product SKU/name → `src/pages/CheckoutPage.tsx`
   - Countdown timer start values → `src/components/checkout/CheckoutTimer.tsx`
   - Customer / shipping / payment form labels → the matching component in `src/components/checkout/`
   - Country list in shipping form → `COUNTRIES` constant in `src/components/checkout/ShippingInfo.tsx`
   - Order summary product, prices, CTA → `src/components/checkout/OrderSummaryCard.tsx`
   - Product page content → `src/pages/ProductPage.tsx`
   - Thank-you page copy, upsell offer → `src/pages/ThankYouPage.tsx` (`UPSELL_PRODUCT = null` disables the banner)
2. **Brand colors** → `/* === BRAND THEME === */` block in `src/index.css`.
3. **Layout or behavior** → section components under `src/components/<family>/`; compose or reorder them in the matching page under `src/pages/`.

Section component families:

- `src/components/checkout/` — `CheckoutHeader`, `CheckoutTimer`, `CustomerInfoCard`, `ShippingInfoCard`, `PaymentInfoCard`, `OrderSummaryCard`, `CheckoutFooter`, `PaymentStatusDialog`, plus `primitives/` (`SectionCard`, `PriceRow`, `SecureBadge`, `GuaranteeBadge`).
- `src/components/product/` — `ProductHeader`, `ProductHero`, `ProductCopySection`.
- `src/components/thank-you/` — `ThankYouHeader`, `OrderConfirmationCard`, `NextStepsCard`, `UpsellOfferBanner`, `UpsellCheckoutModal`.
- `src/components/orders/` — admin orders table, row, drawer, pagination, status pill.
- `src/components/users/` — admin user table, row, add dialog, role select, role pill.
- `src/components/auth/` — `ProtectedRoute`.
- `src/components/dashboard/` / `src/components/settings/` / `src/components/login/` / `src/components/site/` — chrome and layout pieces for the non-storefront surfaces.

Each section component starts with a JSDoc header listing its `data-*` markers and where to edit its copy.

## Semantic markers (preserve when editing)

The DOM uses a stable vocabulary of `data-*` attributes so tools and scripts can target elements without relying on CSS classes:

| Attribute      | Where                       | Meaning                                                                                                |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `data-page`    | `<main>` in page components | Top-level page id (`checkout`, `product`, `thank-you`, `login`, `orders`, `users`)                     |
| `data-region`  | Layout columns              | Coarse regions (`form-stack`, `summary`, `thank-you-main`, …)                                          |
| `data-section` | Section root elements       | Named section (`customer-info`, `order-summary`, `secure-notice`, `guarantee`, `thank-you-failure`, …) |
| `data-slot`    | Swappable leaf nodes        | Role of a node (`product-image`, `cta-primary`, `total-line`, `order-number`, …)                       |
| `data-field`   | Form inputs                 | Stable field id (`email`, `card-number`, …)                                                            |
| `data-row-id`  | `PriceRow` / dashboard rows | Matches `id` of a `PriceLine` or row record                                                            |

Dashboard tables and rows have their own markers worth preserving — verify by reading the component before editing.

Source regions are wrapped in `// #region SECTION: <Name>` / `// #endregion` comments — preserve these fold markers when editing.

## Conventions

- `cn()` from `src/lib/utils.ts` is the standard class-merging utility (clsx + tailwind-merge).
- shadcn UI primitives live in `src/components/ui/`. Checkout-specific primitives (`SectionCard`, `PriceRow`, `SecureBadge`, `GuaranteeBadge`) live in `src/components/checkout/primitives/`.
- The ConvesioPay SDK instance is a module-level singleton in `src/lib/convesiopay.ts` — do not instantiate it elsewhere.
- `SUCCESS_STATUSES` (`"Succeeded"`, `"Authorized"`) and `PENDING_STATUSES` (`"Pending"`) are intentionally duplicated between `src/hooks/useCheckoutPayment.ts`, `src/hooks/useThankYouPayment.ts`, and `worker/index.ts` — the worker and SPA compile as separate bundles, so keep all three in sync when changing them. The worker side also has the `CPAY_STATUS_*` constants in `worker/handlers/payments/payment-status.ts` for the persisted lifecycle (`pending` / `scheduled` / `success` / `failed`).
- D1 access goes through Drizzle via `db(env)` from `worker/db/client.ts`. Do not hand-write SQL or open D1 directly from handlers.
- All dashboard routes go through `ProtectedRoute` on the client; every auth-gated worker handler must call `readAuthenticatedSession` (or a helper that wraps it) from `worker/handlers/auth/shared.ts` and bail with `unauthorizedResponse()` / `forbiddenResponse()` as appropriate.
- `/upsell-payment` is intentionally async. Do not make it charge synchronously — the 2-hour spacing from the original auth is a deliberate fraud/velocity choice, not an implementation detail.
- Cron retries: throwing from `handleSyncPayments` lets Cloudflare retry on the next tick. Catch and persist failure state (e.g. `crover_synced='failed'`) only when you do **not** want a retry, and re-throw when you do.
- Never return the Worker `env` object from any response — it would leak every secret.

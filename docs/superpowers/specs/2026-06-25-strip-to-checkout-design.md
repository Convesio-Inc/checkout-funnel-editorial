# Strip fulfillment-checkout-v3 down to a stateless checkout

**Date:** 2026-06-25
**Status:** Approved

## Goal

Convert the fulfillment checkout into a simple, stateless checkout — the same
shape as the `convesio-spa-checkout-template`, but keeping v3's MERIDIAN
editorial design.

Keep: the editorial checkout page, the thank-you page, and the ConvesioPay
proxy Worker. Remove everything else — database, order management, admin/auth,
user management, crons, the CartRover fulfillment provider, SendGrid email, and
post-purchase upsells.

After the conversion, **ConvesioPay is the single source of truth.** Nothing is
persisted by this app.

## Decisions (locked)

- **Front-end:** keep the full MERIDIAN editorial experience; only remove UI
  tied to deleted backends.
- **Delivery:** commit directly to `main` (no feature branch / PR).
- **Receipt data:** with no database, the worker embeds the purchased line
  items + shipping + customer into the signed JWT (and the 3DS marker token);
  `/verify-token` returns that decoded context. Fully stateless, survives the
  3DS redirect round-trip.
- **Worker layout:** keep v3's modular `worker/handlers/` structure, trimmed to
  config + the four checkout handlers, rewritten stateless.
- **Upsells:** remove entirely (banner, modal, and all upsell handlers). The
  one-click upsell depended on the D1 stored-payment-method row; the deferred
  variant depended on the cron. Both are being deleted.

## Architecture (after)

```
Browser (editorial SPA)  →  Cloudflare Worker  →  ConvesioPay API
   /  (checkout)              GET  /config            (sandbox / live)
   /thank-you                 POST /payments
                              POST /verify-token
                              POST /issue-token
                              POST /poll-payment
```

No D1 binding, no `scheduled()` cron handler, no service bindings, no admin
routes.

## Worker

### Identity & receipt model change

The current worker keys the flow off a D1 `orders.id` (`order_id`). The stateless
model keys off the ConvesioPay `payment_id`, exactly like the SPA template, with
a random `order_number` (UUID) for display.

- `POST /payments` — proxies to ConvesioPay as today, but instead of
  finding/creating an order row it **embeds the checkout context (line items,
  shipping address, customer name/email/phone) into the signed thank-you JWT**,
  and into the pre-signed 3DS marker token baked into `returnUrl`. Returns a
  `redirectUrl` (success/pending) or passes the `actionRequired` body through
  (3DS). No DB writes.
- `POST /verify-token` — verifies the JWT and returns the decoded payload
  **including the embedded line items / shipping / customer**, so the receipt
  renders with no storage.
- `POST /issue-token` — after a 3DS challenge, takes a `payment_id`, confirms it
  upstream, and mints a fresh thank-you JWT (status normalized as today). The
  receipt context for the 3DS path comes from the marker token the thank-you
  page already holds.
- `POST /poll-payment` — takes `payment_id`, GETs the upstream payment status.
- `GET /config` — unchanged (returns public API key + environment).

### Keep (rewritten stateless where noted)

- `worker/index.ts` — reduced to the five routes above; `scheduled()` handler
  removed.
- `worker/handlers/config/config.ts`
- `worker/handlers/payments/{payments,verify-token,issue-token,poll-payment}.ts`
  — rewritten stateless.
- `worker/handlers/payments/shared.ts` — trimmed to the constants/types the four
  handlers still need (endpoints, status sets, required fields, secret helper).
- `worker/handlers/common.ts` — `json` / `readJson`.
- `worker/jwt.ts` — extended to carry the embedded receipt context in the
  signed payload.
- `worker/env.d.ts` — drop DB / removed-service bindings.

### Delete entirely

- `worker/db/**` (client, schema, migrations, payments, users, order-search)
- `worker/handlers/auth/**`
- `worker/handlers/orders/**`
- `worker/handlers/users/**`
- `worker/services/**` (cart-rover, sendgrid)
- `worker/handlers/payments/{upsell-payment,stored-card-charge,sync-payments,process-scheduled-upsells,list-payments,apply-upstream-to-payment,aggregate-items,payment-status}.ts`

## Front-end

### Keep

- Editorial checkout components: `ProductHeroCard`, `BundleSelector`,
  `bundles.ts`, `IngredientsPanel`, `ReviewsSection`, `GuaranteeCard`, `Bottle`,
  `Seal`, `SecurityBadges`, `form-atoms`, `CustomerInfo`, `ShippingInfo`,
  `PaymentInfo`, `OrderSummaryCard`, `PaymentStatusDialog`, checkout primitives.
- Site chrome: `SiteHeader`, `SiteFooter`, `UrgencyRail`, `useStorefrontUrgency`,
  `CheckoutTimer`.
- Pages: `CheckoutPage`, `ThankYouPage`.
- Hooks: `useCheckoutPayment`, `useThankYouPayment`, `useConvesioPayCheckout`.
- Thank-you cards: `NextStepsCard`, `OrderConfirmationCard`, `ThankYouHeader`.
- UI primitives still referenced after deletions.

### Rewire

- `useCheckoutPayment` / `useThankYouPayment` — key off `payment_id` instead of
  `order_id`; `OrderContext` (items/shipping/customer) sourced from the verified
  token rather than a `/verify-token` DB hydrate. The sessionStorage 3DS bridge
  now stores `payment_id`.
- `ShopLayout` — remove the `useAuth` / `LoggedInBar` authenticated admin strip.
- `ThankYouPage` — remove the `UpsellOfferBanner` + `UpsellCheckoutModal` usage
  and related upsell state; keep the dynamic receipt driven by token context.
- `App.tsx` — routes reduce to `/` (checkout) and `/thank-you`. Remove
  `QueryClientProvider`, `AuthProvider`, `BrowserRouter` admin/login routes,
  `DashboardLayout`, and `ProtectedRoute`.
- `main.tsx` — drop any removed provider wiring.

### Delete

- `components/{orders,users,dashboard,settings,login,auth}/**`
- `components/site/LoggedInBar.tsx`
- `components/thank-you/{UpsellOfferBanner,UpsellCheckoutModal}.tsx`
- `pages/{OrderPage,UsersPage,LoginPage}.tsx`
- `layouts/DashboardLayout.tsx`
- `providers/{AuthProvider,OrdersProvider,UsersProvider,OrderDrawerProvider}.tsx`
- `context/{auth,orders,users,orderDrawer}.ts`
- `hooks/{useAuth,useOrders,useUsers,useOrderDrawer}.ts`
- `lib/{orders,users}.ts`
- `query-options/**`, `mutation-options/**`, `utils/orders.ts`
- `components/ui/drawer.tsx` if unused after the orders drawer is removed
  (verified in the plan).

## Config, dependencies, docs

- **`wrangler.jsonc`:** remove `d1_databases` and `triggers.crons`; remove admin
  paths from `assets.run_worker_first`, leaving the checkout routes
  (`/config`, `/payments`, `/verify-token`, `/issue-token`, `/poll-payment`);
  restore `secrets.required` to `["CPAY_API_KEY","CPAY_SECRET","CPAY_INTEGRATION"]`.
  Consider renaming `name` to `checkout-funnel-v3` (optional; keep if it would
  break an existing deployed Worker).
- **`package.json`:** remove `drizzle-orm`, `drizzle-kit`, `@tanstack/react-query`
  (and `vaul` if `ui/drawer` is deleted) once confirmed unused; remove
  `db:migrate` / `db:migrate:remote` scripts; fix the `name` field
  (currently `"ConvesioPay SPA Checkout Template"`).
- **Env files:** strip `AUTH_SALT`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `SENDGRID_API_KEY`, `CARTROVER_API_USER`,
  `CARTROVER_API_KEY` from `.dev.vars`, `.env`, `.env.example` — leaving the
  CPAY vars.
- **`README.md`:** rewrite to the checkout-only story with the editorial
  framing — remove the CartRover / SendGrid / D1 / cron / admin / OAuth /
  upsell sections and the "every 2 hours" fulfillment diagram. Base structure on
  the SPA template README.

## Verification

- `npm run build` (`tsc -b && vite build`) passes with no unused-import or type
  errors after deletions.
- `npm run lint` is clean.
- Dev server boots; a ConvesioPay sandbox test card completes checkout and lands
  on `/thank-you` with the receipt reflecting the **purchased bundle** (1 / 3 /
  6 bottles), not a static fallback.
- The 3DS challenge path resumes correctly via the marker token + `/issue-token`
  + `/poll-payment` (keyed on `payment_id`).

## Out of scope

- No visual redesign of the editorial UI.
- No new features.
- No change to the ConvesioPay integration contract beyond the stateless re-key
  (payment_id-based identity + JWT-embedded receipt context).

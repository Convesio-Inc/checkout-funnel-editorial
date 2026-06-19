# Convesio Fulfillment Checkout V3

A production-ready **single-page application** that renders an **integrated ConvesioPay checkout** in an editorial, print-inspired visual style, ready to deploy on [Convesio Static Sites](https://convesio.com).
Ships as a fully designed **"MERIDIAN — Daily Greens Complex"** supplement checkout demo and serves as the v3 reference implementation.
It features native integrations with FullStack CartRover API + SendGrid API, so every 2 hours orders are synced with CartRover, and the customers are emailed through SendGrid.

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4** and **shadcn/ui**, served from a **Cloudflare Worker** that proxies payment calls server-side so your API keys never leave the server.

---

## Table of Contents

- [Convesio Fulfillment Checkout V3](#convesio-fulfillment-checkout-v3)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [How it Works](#how-it-works)
  - [Prerequisites](#prerequisites)
  - [| **CartRover account** | Order fulfillment sync (`CARTROVER_API_USER` + `CARTROVER_API_KEY`) | cartrover.com |](#-cartrover-account--order-fulfillment-sync-cartrover_api_user--cartrover_api_key--cartrovercom-)
  - [Quick Start](#quick-start)
    - [1. Get the code](#1-get-the-code)
    - [2. Create the D1 database](#2-create-the-d1-database)
    - [3. Deploy to Convesio Static Sites](#3-deploy-to-convesio-static-sites)
    - [4. Create a ConvesioPay integration](#4-create-a-convesiopay-integration)
    - [5. Set up Google OAuth](#5-set-up-google-oauth)
    - [6. Configure all environment variables](#6-configure-all-environment-variables)
    - [7. Verify the checkout](#7-verify-the-checkout)
  - [Environment Variables](#environment-variables)
  - [Testing the Checkout](#testing-the-checkout)
  - [Customization](#customization)
    - [1. Copy, prices and images — edit the component directly](#1-copy-prices-and-images--edit-the-component-directly)
    - [2. Editorial design tokens — `src/index.css`](#2-editorial-design-tokens--srcindexcss)
    - [3. Layout and behavior — section components](#3-layout-and-behavior--section-components)
  - [Local Development](#local-development)
    - [1. Install dependencies](#1-install-dependencies)
    - [2. Apply local database migrations](#2-apply-local-database-migrations)
    - [3. Configure local secrets](#3-configure-local-secrets)
    - [4. Run the dev server](#4-run-the-dev-server)
  - [Available Scripts](#available-scripts)
  - [Project Structure](#project-structure)
  - [Going Live](#going-live)
  - [Security Notes](#security-notes)
  - [Troubleshooting](#troubleshooting)
  - [Resources](#resources)

---

## Features

- **Full checkout flow out of the box** — product page, checkout form (customer + shipping + payment), order summary and a "Thank You" confirmation page.
- **Native upsell functionality** — show customers upsell offers with one-click payment to add products on their previous orders.
- **FullStack CartRover Integration** — sync the processed orders periodically with FullStack CartRover.
- **Email orders to customers automatically** — once orders are processed and synced, an email will be sent each customer via SendGrid.
- **Admin dashboard** — authenticated admin dashboard to check and filter all processed orders.
- **Secure by design** — your secret keys live only in the Cloudflare Worker; the browser never sees them.
- **Re-skinnable in minutes** — copy, prices and images live inline in the component that renders them; each component starts with a JSDoc header so you can find and edit the right file instantly. Brand color is driven by a handful of CSS variables.
- **Sandbox-first** — ships in test mode so you can iterate safely before going live with a single environment-variable change.
- **Modern stack** — React 19, TypeScript, Vite, Tailwind v4, shadcn/ui components, React Router 7.

---

## How it Works

```text
                 ┌────────────────────────────┐
                 │   Browser (SPA)            │
                 │   React + ConvesioPay SDK  │
                 └───────────┬────────────────┘
                             │  1. GET /config          (client key)
                             │  2. POST /payments       (tokenized card)
                             │  3. POST /issue-token    (3DS resume)
                             │  4. POST /verify-token   (JWT → order context)
                             │  5. POST /poll-payment   (async confirmation)
                             │  6. POST /upsell-payment (stored card)
                             ▼
                 ┌────────────────────────────┐
                 │  Cloudflare Worker         │
                 │  worker/index.ts           │
                 │  Holds CPAY_SECRET +       │
                 │  CPAY_API_KEY              │
                 └──────┬─────────────┬───────┘
                        │             │  Signed, server-to-server
                        ▼             ▼
          ┌─────────────────┐  ┌──────────────────┐
          │  Cloudflare D1  │  │  ConvesioPay API  │
          │  (orders +      │  │  sandbox / live   │
          │   payments DB)  │  └──────────────────┘
          └────────┬────────┘
                   │  cron (every 2 h)
                   ▼
          ┌─────────────────┐
          │  CartRover      │
          │  (fulfillment)  │
          └─────────────────┘
```

1. **Card tokenization** — The browser loads the ConvesioPay SDK iframe (`/config` returns the client key). The customer's card is tokenized client-side; raw card data never touches the Worker.
2. **Payment creation** (`POST /payments`) — The Worker finds-or-creates an order in the D1 database, forwards the tokenized card to the ConvesioPay API, and persists the result. On success it signs a **JWT** containing the order/payment IDs and redirects the browser to `/thank-you?token=…`.
3. **3DS challenges** — If the card issuer requires a challenge, ConvesioPay returns a redirect URL. The Worker pre-signs a *marker* JWT (order ID only, no payment ID yet) as the return URL. After the customer completes the challenge they land back on `/thank-you`; the browser calls `/issue-token` to mint the real JWT, then `/verify-token` to fetch order context.
4. **Async polling** — Payments still in a `Pending` state are polled every 5 seconds via `/poll-payment` until a terminal status is received.
5. **Fulfillment sync** — A Cloudflare scheduled task runs every 2 hours to push completed orders to CartRover, the external fulfillment service.

---

## Prerequisites

Before you start, make sure you have:

| Requirement | Purpose | Sign-up |
|---|---|---|
| **Convesio account** | Host and deploy the Static Site | [console.convesio.com/register](https://console.convesio.com/register) |
| **ConvesioPay account** | Accept payments through the checkout | [convesiopay.com/auth/sign-up](https://convesiopay.com/auth/sign-up) |
| **Google Cloud project** | OAuth 2.0 credentials for Google login (`GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`) | [console.cloud.google.com](https://console.cloud.google.com) |
| **SendGrid account** | Transactional email (`SENDGRID_API_KEY`) | [sendgrid.com](https://sendgrid.com) |
| **CartRover account** | Order fulfillment sync (`CARTROVER_API_USER` + `CARTROVER_API_KEY`) | [cartrover.com](https://cartrover.com) |
---

## Quick Start

### 1. Get the code

Fork or clone this repository into your own GitHub account:

```bash
git clone https://github.com/Convesio-Inc/fulfillment-checkout-v3.git
cd fulfillment-checkout-v3
npm install
```

### 2. Create the D1 database

The Worker persists orders and payments in a Cloudflare D1 database. Create one and apply the migrations:

```bash
wrangler d1 create fulfillment-checkout-v3
```

Copy the `database_id` printed by the command and update `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "fulfillment-checkout-v3",
    "database_id": "<your-database-id>"
  }
]
```

Then apply migrations:

```bash
wrangler d1 migrations apply fulfillment-checkout-v3
```

### 3. Deploy to Convesio Static Sites

From your Convesio console, create a new Static Site pointing at your forked repository. Convesio will build and host it automatically. You'll get a public URL — keep it handy for the next two steps.

### 4. Create a ConvesioPay integration

1. Log in to the [ConvesioPay Sandbox console](https://dev.convesiopay.com/) (or [ConvesioPay's Live Console](https://convesiopay.com/) for live environments).
2. Navigate to **Advanced Settings → [Connected Integrations](https://dev.convesiopay.com/advanced-settings/connected-integrations)** and click **CREATE NEW INTEGRATION**. Give it a name of your choice — you'll need it later as `CPAY_INTEGRATION`.
3. Copy the **integration secret key** that gets generated. This will be your `CPAY_SECRET`.
4. Go to **Advanced Settings → [Get Your API Key](https://dev.convesiopay.com/advanced-settings/api-key)** and copy your API key. This will be your `CPAY_API_KEY`.

### 5. Set up Google OAuth

1. Open [Google Cloud Console](https://console.cloud.google.com) and create (or select) a project.
2. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**. Choose **Web application**.
3. Under **Authorized redirect URIs**, add:
   ```
   https://<your-static-site-url>/auth/google/callback
   ```
4. Copy the **Client ID** (`GOOGLE_OAUTH_CLIENT_ID`) and **Client Secret** (`GOOGLE_OAUTH_CLIENT_SECRET`).

### 6. Configure all environment variables

In your Convesio Static Site settings, add every secret listed in [Environment Variables](#environment-variables) below. At minimum:

```bash
# ConvesioPay
CPAY_INTEGRATION=...
CPAY_SECRET=...
CPAY_API_KEY=...

# Auth
AUTH_SALT=<random-64-char-hex>   # e.g. openssl rand -hex 32

# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# SendGrid
SENDGRID_API_KEY=...

# CartRover
CARTROVER_API_USER=...
CARTROVER_API_KEY=...
```

### 7. Verify the checkout

Open your Static Site URL and run a test payment using the card numbers from the [Testing the Checkout](#testing-the-checkout) section. If everything is wired up correctly, you'll land on the Thank You page.

---

## Environment Variables

All credentials are required. They are injected at runtime into the Cloudflare Worker — the browser never has direct access to them.

**ConvesioPay**

| Variable           | Type   | Description                                                                                 |
| ------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `CPAY_INTEGRATION` | secret | Name of the integration you created in the ConvesioPay console.                             |
| `CPAY_SECRET`      | secret | Server-side integration secret. **Never expose this client-side.**                          |
| `CPAY_API_KEY`     | secret | ConvesioPay API key used for server-to-server calls.                                        |
| `CPAY_ENVIRONMENT` | var    | `"test"` (default) or `"live"`. Configured in `wrangler.jsonc`.                             |

**Authentication**

| Variable                     | Type   | Description                                                                                         |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `AUTH_SALT`                  | secret | Random secret used to hash passwords and sign session tokens. Generate with `openssl rand -hex 32`. |
| `GOOGLE_OAUTH_CLIENT_ID`     | secret | OAuth 2.0 client ID from Google Cloud Console.                                                      |
| `GOOGLE_OAUTH_CLIENT_SECRET` | secret | OAuth 2.0 client secret from Google Cloud Console.                                                  |

**Email**

| Variable           | Type   | Description                                        |
| ------------------ | ------ | -------------------------------------------------- |
| `SENDGRID_API_KEY` | secret | SendGrid API key for sending transactional emails. |

**Fulfillment**

| Variable             | Type   | Description                                                           |
| -------------------- | ------ | --------------------------------------------------------------------- |
| `CARTROVER_API_USER` | secret | CartRover API username. Used with `CARTROVER_API_KEY` for Basic auth. |
| `CARTROVER_API_KEY`  | secret | CartRover API key. Combined with `CARTROVER_API_USER` for order sync. |

> Secrets are listed in `wrangler.jsonc` under `secrets.required`. The default configuration ships with `"required": []` (empty) to allow a bootstrap deploy before secrets exist — restore the full list once all secrets are set on the Worker. For local development, set them in a `.dev.vars` file at the project root (see [Local Development](#local-development)).

---

## Testing the Checkout

While `CPAY_ENVIRONMENT` is set to `"test"`, use the official ConvesioPay [test cards](https://docs.convesiopay.com/convesiopay-payment-checkout-integration-api/payments/test-cards) to exercise each payment outcome:

| Scenario              | What to use                                                         | Expected result                                                                     |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Immediate success** | `4000 0200 0000 0000` (Visa, exp `03/30`, CVC `737`)                | Redirected to Thank You page with a confirmed order.                                |
| **3DS challenge**     | `4212 3456 7891 0006` (Visa, exp `03/30`, CVC `737`)                | Redirected to the bank's challenge page; on completion, returned to Thank You page. |
| **Pending / async**   | Unselect `Await Authorization Result` in your connected integration | Thank You page polls every 5 seconds until a terminal status is received.           |
| **Failed payment**    | `4000 0200 0000 0000` (Visa, exp `03/29`, CVC `737`)                | `PaymentStatusDialog` surfaces the error in-checkout so the customer can retry.     |

> **Note:** All test card numbers, expiry dates, and CVCs for each scenario are listed in the [ConvesioPay test cards reference](https://docs.convesiopay.com/convesiopay-payment-checkout-integration-api/payments/test-cards).

---

## Customization

The template is designed to be re-skinned in three layers of increasing depth. **Start from layer 1 and only go deeper if you need to.**

### 1. Copy, prices and images — edit the component directly

Every user-visible string, price and image lives **inline in the component or page that renders it**. There is no separate config file — just find the right file, edit the value, save.

Each component starts with a JSDoc header that describes what it renders and lists its `data-*` markers, making it easy to navigate. Quick reference by what you see on the page:

| What you want to change | File to edit |
|---|---|
| Top navigation bar (brand name, nav links) | `src/components/site/SiteHeader.tsx` |
| Footer copy | `src/components/site/SiteFooter.tsx` |
| Hero product image + bottle illustration | `src/components/checkout/ProductHeroCard.tsx` |
| Checkout section headings, payment amount, product SKU/name | `src/pages/CheckoutPage.tsx` |
| Bundle options (bottle counts, prices, savings) | `src/components/checkout/bundles.ts` |
| Bundle selector + subscription toggle | `src/components/checkout/BundleSelector.tsx` |
| 30-day guarantee card | `src/components/checkout/GuaranteeCard.tsx` |
| Customer testimonials | `src/components/checkout/ReviewsSection.tsx` |
| Ingredient groups | `src/components/checkout/IngredientsPanel.tsx` |
| Customer form labels and placeholders | `src/components/checkout/CustomerInfo.tsx` |
| Shipping form labels, placeholders, and country list | `src/components/checkout/ShippingInfo.tsx` |
| Payment form loading/error messages | `src/components/checkout/PaymentInfo.tsx` |
| Order summary sidebar (product, prices, CTA label, footnote) | `src/components/checkout/OrderSummaryCard.tsx` |
| Trust/security badges | `src/components/checkout/SecurityBadges.tsx` |
| Product page content | `src/pages/ProductPage.tsx` |
| Thank-you page content, upsell offer | `src/pages/ThankYouPage.tsx` |

Replace placeholder images in `public/` and update the `src` paths in the relevant component.

> **⚠ Keep payment amount in sync:** `AMOUNT_MINOR` in `src/pages/CheckoutPage.tsx` is the charge sent to ConvesioPay (in cents). It must match the displayed "Total" in `src/components/checkout/OrderSummaryCard.tsx`. Both files have a warning comment as a reminder.

### 2. Editorial design tokens — `src/index.css`

v3 uses a flat, print-inspired editorial system. All tokens live in the `/* === EDITORIAL TOKENS === */` block in `src/index.css`. The palette:

```css
/* Surfaces */
--color-ivory: #f4f1e8;   /* page background */
--color-bone:  #f4f1e8;   /* alias */
--color-line:  #dcd8c8;   /* hairline borders */

/* Ink scale */
--color-ink:   #0d0d0c;   /* primary text */
--color-ink2:  #2a2826;   /* secondary text */
--color-ink3:  #6b6760;   /* captions, hints */
--color-ink4:  #b0ab9f;   /* placeholder, decorative dashes */

/* Accents */
--color-umber:  #8c4a1c;  /* savings, timers, charge-pending badges */
--color-forest: #1b3326;  /* success states */
```

CSS utility classes (applied with plain class names, no `tw-` prefix):

| Class | Purpose |
|---|---|
| `.serif` | Cormorant Garamond serif |
| `.smallcaps` | Geist sans, all-caps, letter-spaced |
| `.num` | Tabular numerals (lining figures) |
| `.cta` | Flat ink pay button (fill + hover) |
| `.wash` | `background-color: var(--color-ivory)` |
| `.dot` / `.dot.on` | Radio-style circle indicator |
| `.hr` / `.vr` | Hairline horizontal / vertical rule |

**No gradients, no shadows, no rounded cards.** Section boundaries use `border border-line`. Reach for `border-t border-line` as a section divider.

### 3. Layout and behavior — section components

Each section of every page lives in its own component. Compose or reorder them in the matching page file.

**Checkout** (`src/pages/CheckoutPage.tsx`) — two-column editorial layout:

| Component             | File                                              |
| --------------------- | ------------------------------------------------- |
| `ProductHeroCard`     | `src/components/checkout/ProductHeroCard.tsx`     |
| `BundleSelector`      | `src/components/checkout/BundleSelector.tsx`      |
| `GuaranteeCard`       | `src/components/checkout/GuaranteeCard.tsx`       |
| `ReviewsSection`      | `src/components/checkout/ReviewsSection.tsx`      |
| `IngredientsPanel`    | `src/components/checkout/IngredientsPanel.tsx`    |
| `CustomerInfo`        | `src/components/checkout/CustomerInfo.tsx`        |
| `ShippingInfo`        | `src/components/checkout/ShippingInfo.tsx`        |
| `PaymentInfo`         | `src/components/checkout/PaymentInfo.tsx`         |
| `OrderSummaryCard`    | `src/components/checkout/OrderSummaryCard.tsx`    |
| `SecurityBadges`      | `src/components/checkout/SecurityBadges.tsx`      |
| `PaymentStatusDialog` | `src/components/checkout/PaymentStatusDialog.tsx` |

**Product page** (`src/pages/ProductPage.tsx`):

| Component            | File                                            |
| -------------------- | ----------------------------------------------- |
| `ProductHero`        | `src/components/product/ProductHero.tsx`        |
| `ProductCopySection` | `src/components/product/ProductCopySection.tsx` |

**Thank You page** (`src/pages/ThankYouPage.tsx`):

| Component               | File                                                 |
| ----------------------- | ---------------------------------------------------- |
| `ThankYouHeader`        | `src/components/thank-you/ThankYouHeader.tsx`        |
| `OrderConfirmationCard` | `src/components/thank-you/OrderConfirmationCard.tsx` |
| `NextStepsCard`         | `src/components/thank-you/NextStepsCard.tsx`         |
| `UpsellOfferBanner`     | `src/components/thank-you/UpsellOfferBanner.tsx`     |
| `UpsellCheckoutModal`   | `src/components/thank-you/UpsellCheckoutModal.tsx`   |

Each component starts with a JSDoc header listing its `data-*` markers. Components expose `data-section`, `data-slot`, and `data-field` attributes on their root elements so you can target them with CSS selectors without relying on class names.

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Apply local database migrations

The dev server runs a local D1 instance automatically, but you need to apply migrations before the first run:

```bash
wrangler d1 migrations apply fulfillment-checkout-v3 --local
```

### 3. Configure local secrets

Copy `.env.example` to `.dev.vars` and fill in all credentials. The Worker reads this file in local development:

```bash
# ConvesioPay
CPAY_INTEGRATION=...
CPAY_SECRET=...
CPAY_API_KEY=...

# Auth
AUTH_SALT=<random-64-char-hex>
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Email
SENDGRID_API_KEY=...

# Fulfillment
CARTROVER_API_USER=...
CARTROVER_API_KEY=...
```

> `.dev.vars` is git-ignored. Never commit real credentials.

### 4. Run the dev server

```bash
npm run dev
```

This starts Vite with the `@cloudflare/vite-plugin`, which runs the full Worker runtime locally alongside the SPA — no separate Wrangler process needed. The app is available at `http://localhost:5173`.

To preview the production build locally instead:

```bash
npm run preview    # Builds then serves the production bundle
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (SPA only, no worker). |
| `npm run build` | TypeScript typecheck + Vite production build. |
| `npm run lint` | Run ESLint over the codebase. |
| `npm run preview` | Build and preview the production bundle locally. |
| `npm run deploy` | Build and deploy to Cloudflare via Wrangler. |
| `npm run cf-typegen` | Regenerate Cloudflare binding types from `wrangler.jsonc`. |
| `npm run add-envs` | Push all four ConvesioPay secrets to Cloudflare at once. |

---

## Project Structure

```text
.
├── public/                        Static assets (product & brand images)
├── src/
│   ├── components/
│   │   ├── checkout/            ★ Checkout-page section components
│   │   │   ├── BundleSelector.tsx   Bundle picker + visual subscription toggle
│   │   │   ├── bundles.ts           Bundle definitions (bottle counts, prices)
│   │   │   ├── GuaranteeCard.tsx    30-day guarantee block + Seal stamp
│   │   │   ├── IngredientsPanel.tsx 4-column ingredient groups
│   │   │   ├── ProductHeroCard.tsx  Hero product image + bottle illustration
│   │   │   ├── ReviewsSection.tsx   Editorial testimonials
│   │   │   ├── Seal.tsx             Circular guarantee SVG stamp
│   │   │   ├── SecurityBadges.tsx   4-column trust text grid
│   │   │   ├── form-atoms.tsx       SectionHead, Field primitives
│   │   │   └── primitives/          SectionCard, PriceRow
│   │   ├── product/               Product-page components
│   │   ├── thank-you/             Thank-you-page components
│   │   ├── auth/                  Login / auth UI components
│   │   ├── dashboard/             Shared dashboard shell components
│   │   ├── orders/                Order list & drawer components
│   │   ├── settings/              Settings-page components
│   │   ├── users/                 User management components
│   │   └── ui/                    shadcn/ui primitives
│   ├── context/                   React context definitions (auth, orders, users, drawer)
│   ├── hooks/                     Feature hooks (checkout, payment, orders, users, auth)
│   ├── interfaces/                Shared TypeScript interfaces
│   ├── layouts/                   Page shell layouts (ShopLayout, DashboardLayout)
│   ├── lib/                       Utilities + ConvesioPay SDK singleton
│   ├── mutation-options/          TanStack Query mutation option factories
│   ├── pages/                     Route-level pages
│   │   ├── CheckoutPage.tsx
│   │   ├── ProductPage.tsx
│   │   ├── ThankYouPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── OrderPage.tsx
│   │   └── UsersPage.tsx
│   ├── providers/                 Context providers (Auth, Orders, Users, OrderDrawer)
│   ├── query-options/             TanStack Query query option factories
│   ├── utils/                     Standalone utility functions
│   ├── index.css                ★ Editorial design tokens (ivory, ink scale, umber, forest)
│   ├── App.tsx                    Router setup
│   └── main.tsx                   App entry
├── worker/
│   ├── db/
│   │   ├── migrations/            Drizzle SQL migration files
│   │   ├── schema.ts              D1 database schema
│   │   ├── client.ts              Drizzle client initialiser
│   │   ├── payments.ts            Payment & order DB helpers
│   │   ├── users.ts               User & session DB helpers
│   │   └── order-search.ts        Full-text order search helper
│   ├── handlers/
│   │   ├── auth/                  Auth route handlers (login, register, Google OAuth)
│   │   ├── config/                /config handler
│   │   ├── orders/                Order list & search handlers
│   │   ├── payments/              Payment, upsell, poll & token handlers
│   │   ├── users/                 User CRUD handlers
│   │   └── common.ts              Shared handler utilities
│   ├── services/
│   │   ├── cart-rover.ts          CartRover fulfillment sync
│   │   └── sendgrid.ts            SendGrid email client
│   ├── index.ts                   Worker entry: route dispatch + cron trigger
│   ├── jwt.ts                     HS256 helpers for checkout redirect tokens
│   └── env.d.ts                   Cloudflare env bindings type declarations
├── .env.example                   Template for .dev.vars
├── wrangler.jsonc                 Cloudflare Worker + D1 + cron configuration
├── package.json
└── README.md
```

---

## Going Live

When you're confident the checkout works end-to-end in sandbox:

1. Create a **production** integration in the live [ConvesioPay console](https://convesiopay.com) (not the `dev.` one) and capture its credentials.
2. In your Google Cloud project, add your live Static Site URL to the **Authorized redirect URIs** of your OAuth client:
   ```
   https://<your-live-url>/auth/google/callback
   ```
3. Update every secret in your Convesio Static Site settings with live values — ConvesioPay, Google OAuth, SendGrid, and CartRover credentials.
4. In `wrangler.jsonc`, change:

   ```jsonc
   "vars": {
     "CPAY_ENVIRONMENT": "live"
   }
   ```

5. Redeploy and process a small real transaction to verify end-to-end.

---

## Security Notes

- **Always start in sandbox.** Test thoroughly with the [official test cards](https://docs.convesiopay.com/convesiopay-payment-checkout-integration-api/payments/test-cards) before flipping `CPAY_ENVIRONMENT` to `"live"`.
- **Never hardcode credentials.** All keys must live in environment variables — never in frontend code or committed files. `.dev.vars` is git-ignored for this reason.
- **Generate a strong `AUTH_SALT`.** Use `openssl rand -hex 32` and treat it like a private key. Rotating it invalidates all active sessions.
- **Never return the `env` object** from the Worker's `fetch` function on any API endpoint — doing so would expose every secret.
- **Keep Google OAuth redirect URIs tight.** Only add the exact callback path (`/auth/google/callback`) for domains you control.
- **Keep dependencies up to date** with `npm audit` and regular upgrades.

---

## Troubleshooting

**I get a 401 / 403 from `/payments`.**
Verify `CPAY_SECRET`, `CPAY_API_KEY`, and `CPAY_INTEGRATION` are set as Worker secrets (not plain vars) and match the integration you're targeting.

**Payment succeeds in sandbox but fails in live.**
Live integrations require their own distinct credentials — sandbox keys won't work against the live API. Double-check you've created a separate integration in the production console.

**Google login fails with a redirect_uri_mismatch error.**
The redirect URI in your Google Cloud OAuth client must exactly match `https://<your-site-url>/auth/google/callback`. A trailing slash or wrong domain will cause this error.

**Worker fails to start locally (`missing binding: DB`).**
Run `wrangler d1 migrations apply fulfillment-checkout-v3 --local` to create and seed the local D1 database before starting the dev server.

**Orders aren't syncing to CartRover.**
Check that `CARTROVER_API_USER` and `CARTROVER_API_KEY` are set correctly. The sync runs on a 2-hour cron — you can trigger it manually via `wrangler dev` and the scheduled event.

**I edited a component but the page didn't update.**
Stop and restart the dev server. Vite usually hot-reloads, but some changes can occasionally require a clean restart.

---

## Resources

- [Convesio Console](https://console.convesio.com)
- [ConvesioPay Console](https://convesiopay.com) · [Sandbox Console](https://dev.convesiopay.com)
- [ConvesioPay Checkout Integration Docs](https://docs.convesiopay.com/convesiopay-payment-checkout-integration-api)
- [ConvesioPay Test Cards](https://docs.convesiopay.com/convesiopay-payment-checkout-integration-api/payments/test-cards)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Vite](https://vitejs.dev) · [React](https://react.dev) · [Tailwind CSS](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com)

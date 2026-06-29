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
| `STORE_MANAGER_CAMPAIGN_URL` | Optional. When set, a successful payment POSTs an `order.created` event to this Store Manager campaign webhook |

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

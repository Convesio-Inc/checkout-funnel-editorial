# Editorial Checkout Redesign (v3) — Design

**Date:** 2026-06-16
**Status:** Approved design, pending spec review
**Reference:** `Checkout v3 - Editorial.html` (single-file React/Tailwind sample, "MERIDIAN — Daily Greens Complex")

## Goal

Re-skin the storefront **checkout page** and **thank-you page** of this fork
(`fulfillment-checkout-v3`) to match the *Editorial* visual system in the
reference HTML, adopting its Meridian demo content wholesale. Stand the fork up
as an independent Cloudflare deployment (new Worker + new D1) on a new GitHub
remote, and deploy it.

The codebase already carries Meridian **content** (Daily Greens Complex, bundle
tiers, guarantee, reviews, ingredients) and a Meridian **palette**, but renders
it in a *glossy* style (shadowed cards, amber-gradient CTA, Instrument Serif).
This work converts that to the *Editorial* style: flat ivory, hairline-only
borders, no shadows/gradients, a flat ink→umber CTA, Cormorant Garamond
display type, and underline-only form inputs.

## Non-goals

- No changes to the ConvesioPay payment flow, JWT redirect, `/payments`,
  upsell deferral, cron, dashboard, or auth.
- No real subscription/recurring billing. The reference's "Monthly
  replenishment −20%" toggle is **visual only** — pricing stays one-time and the
  amount sent to ConvesioPay is unchanged.
- No restyle of the dashboard / login / admin surfaces. The app-shell shadcn
  tokens stay neutral.

## Constraints

- Must keep the live ConvesioPay iframe in `PaymentInfo.tsx` working — only its
  container chrome changes.
- Preserve all `data-page` / `data-region` / `data-section` / `data-slot` /
  `data-field` semantic markers and `// #region` fold comments.
- Tailwind v4 + the existing token system in `src/index.css` (`@theme inline`).
- Must not collide with the v2 Worker or v2 D1 database.

## Approach

### Tokens & global CSS — `src/index.css`, `index.html`

Redefine the storefront palette **in place** (not a parallel token set) and
replace the gloss/gradient helpers with the reference's flat equivalents.
App-shell shadcn tokens are untouched.

- **Fonts:** serif Instrument Serif → **Cormorant Garamond** (add a Google
  Fonts `@import` with the reference's weights/italics: `0,300;0,400;0,500;0,600;1,300;1,400`).
  Keep **Geist** (fontsource) and **Geist Mono** (Google Fonts).
- **Palette (editorial values):**
  `ivory #f4f1e8`, `paper #fbfaf4`, `ink #0d0d0c`, `ink2 #3a3a36`,
  `ink3 #787870`, `ink4 #b3b1a6`, `rule #dcd8c8`, `rule2 #e8e4d4`,
  `forest #1b3326`, `umber #8c4a1c`, `umber2 #6f3a14`.
  Existing component class names (`bone`, `line`, `amber`, …) are migrated to
  these; where a 1:1 rename is cleaner the components are updated to the new
  token names.
- **Helpers:** body background → ivory. Replace `.gloss-card*`, `.gloss-cta`,
  `.gloss-forest`, `.gloss-input`, `.gloss-pill`, `.stripes`, `.ring-forest`
  with the reference's flat set:
  - `.cta` — flat ink bg, `#fbfaf4` text, hover `umber`, active `umber2`.
  - `.hr` / `.vr` — single hairline rules (`#dcd8c8`).
  - underline `input[type=...]` / `select` — transparent bg, bottom border
    `#c9c4b1`, focus bottom-border ink.
  - `.wash` — pale radial product backdrop.
  - `.dot` / `.dot.on` — radio dot for bundle selection.
  - `.smallcaps` — uppercase + letter-spaced label style.
  - Keep `.num`, `.serif` (point `.serif` at Cormorant), `livedot`, `tick`.
  - Keep the existing `.order-cta` busy/done overlay + `cta-checkmark`
    animation (it drives the OrderSummaryCard submit states) but reskin its
    visual to flat ink.

### Checkout layout reflow — `src/pages/CheckoutPage.tsx`

Reflow to the reference structure while preserving all state wiring
(`selectedBundle`, `customer`, `shipping`, `isPaymentValid`, `pay()`,
`PaymentStatusDialog`):

- Full-width **Hero** at top (Cormorant ~80px headline + bottle in a `.wash`
  panel), inside the `max-w-[1200px]` editorial container.
- Below a top hairline, a two-column grid:
  - **Left** — "Step one / Choose your supply": `SubToggle` (visual) + bundle
    rows + `GuaranteeCard` + `Testimonials` + `Ingredients`.
  - **Right** — sticky form column with a left vertical rule (`.vr`):
    "Your details." hairline header (lock smallcaps), then the three form
    sections (`SectionHead` roman numerals I/II/III), inline order summary, the
    flat ink CTA, the not-charged note, and the text-only `Trust` row.

### Storefront section components (re-skin)

Re-skin to the flat hairline language; keep props, markers, fold comments.

| Current component | Reference analog | Notes |
| --- | --- | --- |
| `site/UrgencyRail.tsx` | `Rail` | thin sticky bar: viewers + smallcaps trust + countdown |
| `site/SiteHeader.tsx` | `MastHead` | Cormorant wordmark + nav + "Secure" |
| `checkout/ProductHeroCard.tsx` | `Hero` | full-width hero, big serif, dot-list claims |
| `checkout/Bottle.tsx` | `Bottle` | apothecary bottle SVG — align label/colors to ref |
| `checkout/BundleSelector.tsx` + `bundles.ts` | `BundleRow` + `SubToggle` | radio `.dot`, hairline rows, no cards; House Favourite tag |
| `checkout/GuaranteeCard.tsx` + `Seal.tsx` | `Guarantee` + `Stamp` | circular stamp SVG + editorial copy |
| `checkout/ReviewsSection.tsx` | `Testimonials` | serif italic pull-quotes, rating block |
| `checkout/IngredientsPanel.tsx` | `Ingredients` | 4-column ingredient lists |
| `checkout/SecurityBadges.tsx` | `Trust` | text-only wordmarks (SSL/PCI/Merchant/Privacy) |
| `checkout/CustomerInfo/ShippingInfo/PaymentInfo` + `form-atoms.tsx` | `CheckoutForm` + `Field`/`SectionHead` | underline inputs, smallcaps labels |
| `checkout/OrderSummaryCard.tsx` | inline summary + CTA | flat ink CTA, hairline total |
| `site/SiteFooter.tsx` | `footer` | editorial 3-column footer |

`PaymentInfo` keeps the live ConvesioPay iframe mount
(`#cpay-checkout-component`, `data-slot="cpay-mount"`); only the surrounding box
goes flat/hairline. The accepted-card pills become the reference's
`VISA · MC · AMEX · DISC` mono text.

### Thank-you page re-skin — `src/pages/ThankYouPage.tsx`, `src/components/thank-you/*`

Apply the same editorial system (ivory, hairlines, Cormorant headings, flat ink
CTA, smallcaps labels) to `ThankYouHeader`, `OrderConfirmationCard`,
`NextStepsCard`, `UpsellOfferBanner`, `UpsellCheckoutModal`, and the
verifying/pending/succeeded/failed states. **No logic changes** to verify →
poll → upsell. The reference has no thank-you design, so its visual vocabulary
is extrapolated.

### Infrastructure

- **`wrangler.jsonc`:** `name` → `fulfillment-checkout-v3`; D1 `database_name` →
  `fulfillment-checkout-v3` with a **new `database_id`** from
  `wrangler d1 create fulfillment-checkout-v3`.
- **`package.json`:** `db:migrate` / `db:migrate:remote` repointed v2 → v3.
- **Git remote:** `git remote set-url origin git@github.com:Convesio-Inc/fulfillment-checkout-v3.git`,
  push `main` (repo already exists).
- **Local test:** `npm run preview` (full worker + D1 + iframe) with the
  existing `.dev.vars`.

### Deploy (full)

`npm run build` → `wrangler d1 create fulfillment-checkout-v3` → apply remote
migrations (`db:migrate:remote`) → set secrets (`npm run add-envs` + auth /
google / sendgrid / cartrover — **values provided by user when prompted**) →
`wrangler deploy`. The `secrets.required: []` bootstrap already in
`wrangler.jsonc` allows the first deploy of a brand-new Worker; restore the
`required` list afterward.

## Verification

- `npm run preview`, then drive the checkout with the preview tools:
  console/network clean, snapshot confirms editorial layout, the ConvesioPay
  iframe mounts, a test card tokenizes and redirects to the restyled thank-you
  page (pending/succeeded states render).
- `npm run build` + `npm run lint` pass.
- Visual diff of checkout + thank-you against the reference (screenshots).

## Risks

- **Token migration churn:** renaming palette tokens touches many components;
  mitigated by re-skinning component-by-component and building after each group.
- **First-deploy secret bootstrap:** new Worker has no version until the first
  deploy; the empty `required` list handles this, then secrets are restored.
- **D1 id drift:** the new `database_id` must be pasted into `wrangler.jsonc`
  immediately after `d1 create`, before any remote migration.

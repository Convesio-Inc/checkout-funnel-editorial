# Editorial Checkout Redesign (v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the storefront checkout + thank-you pages to the "Editorial" Meridian style from `Checkout v3 - Editorial.html`, and stand the fork up as an independent Cloudflare deployment (new Worker + new D1) on a new GitHub remote.

**Architecture:** Redefine the storefront palette/CSS helpers in `src/index.css` from glossy → flat editorial, then re-skin each storefront component (chrome, hero, bundles, guarantee, testimonials, ingredients, form, summary) to the reference's hairline language while preserving all ConvesioPay/JWT/upsell wiring and `data-*` markers. Reflow `CheckoutPage` to a full-width hero + two-column grid. Re-skin the thank-you surfaces with the same vocabulary. Then repoint git, rename the Worker/D1, and deploy.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 (`@theme inline` tokens), Vite, Cloudflare Workers + D1, Wrangler.

**Reference:** The single-file sample `Checkout v3 - Editorial.html` (referred to below as "the reference") is the source of truth for markup, classes, copy, and SVG. Mirror its JSX into the existing components. Component → reference-function map:

| Existing file | Reference function | Reference lines (approx) |
| --- | --- | --- |
| `site/UrgencyRail.tsx` | `Rail` | 141–167 |
| `site/SiteHeader.tsx` | `MastHead` | 170–191 |
| `checkout/Bottle.tsx` | `Bottle` | 194–235 |
| `checkout/ProductHeroCard.tsx` | `Hero` | 570–594 |
| `checkout/bundles.ts` + `BundleSelector.tsx` | `BUNDLES`/`price`/`BundleRow`/`SubToggle` | 238–317 |
| `checkout/GuaranteeCard.tsx` + `Seal.tsx` | `Guarantee` + `Stamp` | 320–360 |
| `checkout/ReviewsSection.tsx` | `Testimonials` | 363–395 |
| `checkout/SecurityBadges.tsx` | `Trust` | 398–415 |
| `checkout/IngredientsPanel.tsx` | `Ingredients` | 418–447 |
| `checkout/form-atoms.tsx` | `Field` + `SectionHead` | 450–460, 557–567 |
| `checkout/CustomerInfo/ShippingInfo/PaymentInfo` | `CheckoutForm` sections | 463–555 |
| `checkout/OrderSummaryCard.tsx` | summary `<section>` + CTA | 517–549 |
| `site/SiteFooter.tsx` | `footer` | 642–660 |
| `pages/CheckoutPage.tsx` | `App` | 596–663 |

**Verification model:** No unit tests exist for these visual components. Each task is gated by `npm run build` (tsc + vite) and, for the final integration, `npm run lint` + `npm run preview` driven through the preview MCP tools. Commit after each task.

---

## Task 1: Global tokens, CSS helpers, fonts, icons

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/icons.tsx`

- [ ] **Step 1: Swap the serif font import and add Cormorant Garamond**

In `src/index.css` line 1, replace the Google Fonts import with:

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Geist+Mono:wght@400;500;600&display=swap');
```

- [ ] **Step 2: Point `--font-serif` at Cormorant Garamond**

In the `@theme inline` block, change `--font-serif`:

```css
--font-serif: "Cormorant Garamond", ui-serif, Georgia, serif;
```

- [ ] **Step 3: Replace the palette token values with the editorial set**

In `@theme inline`, replace the `MERIDIAN PALETTE` block with the editorial values (keep the token *names* used by components — `bone`/`bone2`/`paper`/`ink`/`ink2`/`ink3`/`line`/`line2`/`forest`/`amber` — but remap to editorial colors, and add `ink4`, `rule`, `rule2`, `umber`, `umber2`):

```css
/* === MERIDIAN PALETTE — EDITORIAL === */
--color-ivory: #f4f1e8;
--color-bone: #f4f1e8;        /* alias: storefront bg */
--color-bone2: #efece1;       /* wash base */
--color-paper: #fbfaf4;
--color-ink: #0d0d0c;
--color-ink2: #3a3a36;
--color-ink3: #787870;
--color-ink4: #b3b1a6;
--color-line: #dcd8c8;        /* alias of rule */
--color-line2: #e8e4d4;
--color-rule: #dcd8c8;
--color-rule2: #e8e4d4;
--color-forest: #1b3326;
--color-umber: #8c4a1c;
--color-umber2: #6f3a14;
--color-amber: #8c4a1c;       /* alias: legacy amber → umber */
--color-rust: #8c4a1c;
```

- [ ] **Step 4: Replace the gloss helpers + typography/surface helpers with the editorial flat set**

Replace everything from `/* === Typography helpers ... */` (line ~118) through `.tick { ... }` (line ~242) — i.e. the `.num`/`.serif`/`.gloss-*`/`.ring-forest`/`.stripes`/`.rule`/`livedot`/`tick` block — with:

```css
/* === Typography helpers === */
.num { font-family: "Geist Mono", ui-monospace, monospace; font-feature-settings: "tnum" 1, "ss01" 1; }
.serif { font-family: "Cormorant Garamond", ui-serif, Georgia, serif; }
.smallcaps { font-feature-settings: "smcp" 1; letter-spacing: 0.18em; text-transform: uppercase; }

/* hairlines */
.hr { border-top: 1px solid #dcd8c8; }
.vr { border-left: 1px solid #dcd8c8; }
.rule { border-top: 1px solid #dcd8c8; }

/* underline inputs — flat, hairline */
input[type="text"], input[type="email"], input[type="tel"], select {
  font-family: "Geist", ui-sans-serif, system-ui, sans-serif;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #c9c4b1;
  width: 100%;
  padding: 10px 0 9px;
  font-size: 15px;
  color: #0d0d0c;
  transition: border-color .18s ease;
}
input::placeholder { color: #b3b1a6; font-weight: 300; }
input:focus, select:focus { outline: none; border-bottom-color: #0d0d0c; }
select { appearance: none; -webkit-appearance: none; background-image: none; padding-right: 14px; }

/* CTA — flat ink with umber hover */
.cta { background: #0d0d0c; color: #fbfaf4; transition: background .18s ease, color .18s ease; }
.cta:hover:not(:disabled) { background: #8c4a1c; }
.cta:active:not(:disabled) { background: #6f3a14; }
.cta:disabled { opacity: .5; cursor: not-allowed; }

/* product silhouette backdrop */
.wash { background: radial-gradient(60% 50% at 50% 40%, #ffffff 0%, rgba(255,255,255,0) 70%), #efece1; }

/* radio dot for selected bundle */
.dot { width: 10px; height: 10px; border-radius: 999px; border: 1px solid #0d0d0c; display: inline-block; }
.dot.on { background: #0d0d0c; box-shadow: inset 0 0 0 2px #f4f1e8; }

::selection { background: #0d0d0c; color: #f4f1e8; }

@keyframes livedot { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.livedot { animation: livedot 1.8s ease-in-out infinite; }
@keyframes tick { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.tick { animation: tick 1s steps(2, end) infinite; }
```

Leave the `.order-cta` busy/done overlay block and `cta-checkmark` keyframes BELOW it intact (the OrderSummaryCard still uses them) — they layer on top of `.cta` fine.

- [ ] **Step 5: Add `Plus` and `Dot` icons used by the reference**

In `src/components/icons.tsx`, add two entries to the `Icon` object (the reference's Hero uses `Icon.Dot`, the bundle/qty uses `Icon.Plus`):

```tsx
  Plus: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Dot: (p: IconProps) => (
    <svg viewBox="0 0 8 8" {...p}><circle cx="4" cy="4" r="3" fill="currentColor" /></svg>
  ),
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS (tsc + vite build succeed; no missing-token errors).

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/components/icons.tsx
git commit -m "feat: editorial palette, flat CSS helpers, Cormorant Garamond, Dot/Plus icons"
```

---

## Task 2: Form atoms (underline inputs, roman-numeral section heads)

**Files:**
- Modify: `src/components/checkout/form-atoms.tsx`

- [ ] **Step 1: Change `inputCls` to the underline treatment**

The global `input`/`select` CSS now drives the underline look, so `inputCls` only needs spacing/typography. Replace:

```tsx
export const inputCls =
  "w-full text-[15px] text-ink placeholder:text-ink4";
```

- [ ] **Step 2: Rewrite `Field` to the reference's smallcaps label (lines 450–460)**

```tsx
export function Field({
  label,
  children,
  span = "col-span-2",
  optional = false,
  hint,
  dataField,
}: FieldProps) {
  return (
    <label className={"block " + span} data-field={dataField}>
      <span className="smallcaps text-[9.5px] text-ink3 flex items-baseline justify-between">
        <span>{label}</span>
        {optional && <span className="text-ink4 normal-case tracking-normal text-[10px]">optional</span>}
        {hint && <span className="text-ink4 normal-case tracking-normal text-[10px]">{hint}</span>}
      </span>
      <span className="block mt-1">{children}</span>
    </label>
  );
}
```

- [ ] **Step 3: Rewrite `SectionHead` to the reference's serif roman-numeral head (lines 557–567)**

Keep the `{ n, title, sub }` props but render the editorial way (the `sub` becomes the optional `right` slot text styled as mono accent; pass numerals from the page):

```tsx
export function SectionHead({ n, title, sub }: SectionHeadProps) {
  return (
    <div className="flex items-baseline justify-between mb-5">
      <div className="flex items-baseline gap-3">
        <span className="serif italic text-[18px] text-ink3">{n}.</span>
        <h3 className="serif text-[22px] leading-none">{title}.</h3>
      </div>
      {sub && <span className="num text-[10.5px] text-ink3 tracking-[0.08em]">{sub}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkout/form-atoms.tsx
git commit -m "feat: editorial form atoms — underline inputs, serif roman-numeral section heads"
```

---

## Task 3: Site chrome — Rail, MastHead, Footer, layout background

**Files:**
- Modify: `src/components/site/UrgencyRail.tsx`
- Modify: `src/components/site/SiteHeader.tsx`
- Modify: `src/components/site/SiteFooter.tsx`
- Modify: `src/layouts/ShopLayout.tsx`

- [ ] **Step 1: Re-skin `UrgencyRail` to the reference `Rail` (lines 141–167)**

Mirror the reference markup: `sticky top-0 z-40 bg-ivory border-b border-rule`, `max-w-[1200px] mx-auto px-8 h-10`, live umber dot + `<span className="num text-ink">{viewers}</span> guests reviewing this offer`, the middle smallcaps trust strip (`Complimentary shipping · Third-party tested · Made in Oregon`), and the right `Order reserved` + `mm:ss` countdown. Preserve any existing `data-*` markers on the root. Reuse the component's existing countdown/viewers hooks if present; otherwise port `useCountdown(5*60)` and `useViewers()` from the reference (lines 126–138).

- [ ] **Step 2: Re-skin `SiteHeader` to the reference `MastHead` (lines 170–191)**

`border-b border-rule`, `max-w-[1200px] mx-auto px-8 h-20`, serif `Meridian` wordmark (26px, `tracking-[0.04em]`) with `Botanicals · Est. 2019` smallcaps subline, the nav links (`Apothecary / Science / Journal / The Guarantee`), and the right `Icon.Lock` + `Secure` smallcaps. Keep existing nav `data-*`/routing props.

- [ ] **Step 3: Re-skin `SiteFooter` to the reference `footer` (lines 642–660)**

`border-t border-rule`, `max-w-[1200px] mx-auto px-8 py-10 grid md:grid-cols-3`, serif `Meridian Botanicals`, address `126 SE Stark Street · Portland, Oregon`, `© 2026 — all formulas, original.`, the link row, and the `Icon.Lock` secure-checkout smallcaps.

- [ ] **Step 4: Set the storefront background to ivory in `ShopLayout`**

In `src/layouts/ShopLayout.tsx` line 12, the wrapper is already `bg-bone text-ink`; with the remapped tokens `bone` is now ivory, so no change is required — verify it renders ivory. (No edit unless it hardcodes a hex.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/site/ src/layouts/ShopLayout.tsx
git commit -m "feat: editorial site chrome — Rail, MastHead, Footer"
```

---

## Task 4: Bottle + Hero

**Files:**
- Modify: `src/components/checkout/Bottle.tsx`
- Modify: `src/components/checkout/ProductHeroCard.tsx`

- [ ] **Step 1: Align `Bottle` SVG to the reference `Bottle` (lines 194–235)**

Replace the SVG body with the reference's apothecary bottle (deep-green `#1b3326` glass, ivory `#f4f1e8` label, Cormorant italic "Meridian", `DAILY GREENS / COMPLEX`, ingredient lines, `NET WT. 240G`, umber mark). Keep the component's existing prop signature (`w`/`h`/`ghost`).

- [ ] **Step 2: Re-skin `ProductHeroCard` to the reference `Hero` (lines 570–594)**

`grid grid-cols-[minmax(280px,420px)_1fr] gap-12 items-end py-12`. Left: `.wash` panel with `border border-rule` wrapping `<Bottle w={240} h={460}/>`. Right: `N° 01 — Daily ritual` smallcaps, `serif text-[80px] leading-[0.92]` headline `Daily Greens / Complex.` (second line italic), the descriptive paragraph, and the four `Icon.Dot` claim chips (NSF Certified / Non-GMO / Vegan · Gluten free / Plant-based capsules). Preserve the component's existing `data-*` markers.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/Bottle.tsx src/components/checkout/ProductHeroCard.tsx
git commit -m "feat: editorial Bottle SVG + full-width Hero"
```

---

## Task 5: Bundle selector + subscription toggle (visual only)

**Files:**
- Modify: `src/components/checkout/BundleSelector.tsx`
- Modify: `src/components/checkout/bundles.ts` (only if copy/labels need to match)

- [ ] **Step 1: Add a `SubToggle` and editorial bundle rows to `BundleSelector`**

Keep the component's existing props (`value: Bundle`, `onChange`). Add internal `const [sub, setSub] = useState(false)` for the **visual-only** subscription toggle — it must NOT change `value.totalAmountMinor` or anything sent to ConvesioPay. Render:
- The reference `SubToggle` (lines 294–317): `Replenishment` smallcaps + `One-time order` / `Monthly replenishment −20%` tabs (border-bottom on the active tab). Wire to local `sub` state only.
- The reference `BundleRow` (lines 251–291) for each bundle: `grid grid-cols-[28px_1fr_auto]`, radio `.dot`/`.dot.on`, serif label (`Single`/`Pair`/`Trio` — map from `bottleCount`), `num` bottle count, `House Favourite` umber tag when `bottleCount === 3`, supply tagline + savings, and the right price block (`$unit` per bottle, list strike-through + total). Compute display price from the existing `Bundle` fields (`pricePerBottle`, `totalAmountMinor`, `originalAmountMinor`); when `sub` is true show the −20% *display* unit (`pricePerBottle * 0.8`) but do not mutate the bundle.

- [ ] **Step 2: Map bundle display labels**

In the row, derive the serif label from `bottleCount`: `1 → "Single"`, `2 → "Pair"`, `3 → "Trio"`. Derive the tagline from `supplyLabel` already on the bundle. No data file change needed unless `supplyLabel` text differs from the reference taglines — if so, update `bundles.ts` strings to: `"Thirty-day supply"`, `"Sixty-day supply"`, `"Ninety-day supply, two complimentary"`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/BundleSelector.tsx src/components/checkout/bundles.ts
git commit -m "feat: editorial bundle rows + visual subscription toggle"
```

---

## Task 6: Guarantee + Stamp

**Files:**
- Modify: `src/components/checkout/GuaranteeCard.tsx`
- Modify: `src/components/checkout/Seal.tsx`

- [ ] **Step 1: Align `Seal` to the reference `Stamp` (lines 341–360)**

Replace the SVG with the reference circular guarantee stamp (textPath ring `MERIDIAN BOTANICALS · GUARANTEE`, Cormorant italic `30`, `DAY RETURN`). Keep the component's export name/props.

- [ ] **Step 2: Re-skin `GuaranteeCard` to the reference `Guarantee` (lines 320–339)**

`grid grid-cols-[120px_1fr] gap-8 py-10 border-t border-rule`, the `Stamp`, `The Empty-Bottle Promise` smallcaps, serif italic 34px headline, the paragraph, and the two `Icon.Check` assurances. Preserve `data-section="guarantee"` if present.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/GuaranteeCard.tsx src/components/checkout/Seal.tsx
git commit -m "feat: editorial guarantee + circular stamp"
```

---

## Task 7: Testimonials, Ingredients, Trust badges

**Files:**
- Modify: `src/components/checkout/ReviewsSection.tsx`
- Modify: `src/components/checkout/IngredientsPanel.tsx`
- Modify: `src/components/checkout/SecurityBadges.tsx`

- [ ] **Step 1: Re-skin `ReviewsSection` to the reference `Testimonials` (lines 363–395)**

`border-t border-rule py-12`, `From the cabinet` smallcaps + serif `Notes from our readers.` head, the `4.86` / `12,408 verified · five stars` rating block, and the 3-column serif-italic pull-quotes with smallcaps `who — loc` captions. Use the reference's three items.

- [ ] **Step 2: Re-skin `IngredientsPanel` to the reference `Ingredients` (lines 418–447)**

`border-t border-rule py-12`, serif `Inside the formula.` + `32 organic ingredients · USDA` smallcaps, and the 4-column lists (Adaptogens / Greens / Roots & spice / Digestion) with serif-italic column heads and `—`-prefixed list items.

- [ ] **Step 3: Re-skin `SecurityBadges` to the reference `Trust` (lines 398–415)**

`grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 pt-6 border-t border-rule`, text-only wordmarks: `SSL / TLS 1.3` · `256-bit · encrypted`, `PCI DSS` · `Level 1 compliant`, `Verified Merchant` · `Since 2019`, `Privacy Guard` · `No data resale`. Preserve any existing `data-section`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkout/ReviewsSection.tsx src/components/checkout/IngredientsPanel.tsx src/components/checkout/SecurityBadges.tsx
git commit -m "feat: editorial testimonials, ingredients, trust badges"
```

---

## Task 8: Form sections — Customer, Shipping, Payment (keep iframe)

**Files:**
- Modify: `src/components/checkout/CustomerInfo.tsx`
- Modify: `src/components/checkout/ShippingInfo.tsx`
- Modify: `src/components/checkout/PaymentInfo.tsx`

- [ ] **Step 1: Re-skin `CustomerInfo` fields (reference lines 476–482)**

Use the editorial `Field` (Task 2) with smallcaps labels `Electronic mail` / `Telephone` (optional) in a `grid grid-cols-2 gap-x-6 gap-y-5`. Keep the existing `value`/`onChange` props, `data-field` markers, and input `type`s. Inputs need no class beyond the global underline style; pass `className={inputCls}` if the component already threads it.

- [ ] **Step 2: Re-skin `ShippingInfo` fields (reference lines 484–499)**

Editorial `Field`s: `First name`/`Family name` (`col-span-1`), `Street`, `Apartment / suite` (optional, `col-span-1`), `City` (`col-span-1`), `State` (`col-span-1`, the `<select>`), `Postal code` (`col-span-1`). Keep the existing `COUNTRIES`/state list, `value`/`onChange`, and `data-field` markers. `grid grid-cols-2 gap-x-6 gap-y-5`.

- [ ] **Step 3: Re-skin the `PaymentInfo` container (keep the live iframe)**

Replace the boxed `bg-bone2/40 border border-line rounded-md p-4` wrapper with a flat editorial container (no card). Keep the mount div untouched:

```tsx
<div
  ref={mountRef}
  data-slot="cpay-mount"
  id="cpay-checkout-component"
  className="min-h-[220px]"
/>
```

Below it, render the reference's tokenization note (`Icon.Lock` + "Tokenized via TLS 1.3 — your card never touches our servers.") and change the accepted-card pills to mono text `VISA · MC · AMEX · DISC` (reference line 503), styled `num text-[10.5px] text-ink3 tracking-[0.08em]`. Keep `status === "loading"`/`"error"` branches and their `data-slot`s.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkout/CustomerInfo.tsx src/components/checkout/ShippingInfo.tsx src/components/checkout/PaymentInfo.tsx
git commit -m "feat: editorial form sections; flatten payment iframe container"
```

---

## Task 9: Order summary + flat ink CTA

**Files:**
- Modify: `src/components/checkout/OrderSummaryCard.tsx`

- [ ] **Step 1: Re-skin the summary block to the reference (lines 517–540)**

Keep the `selectedBundle`/`payDisabled`/`payLoading` props, the `ctaState` busy/done effect, `formatDollars`, and `data-section="order-summary"`. Replace the markup with a hairline `dl` summary: line item `{bottleCount} × Daily Greens Complex (one-time)` + total, `Shipping` → `Complimentary`, bundle-savings row in umber when `savingsMinor`/derived savings > 0, then an `.hr` total row with smallcaps `Total today` and the big mono total + `USD`.

- [ ] **Step 2: Convert the CTA from `gloss-cta` to flat `.cta`**

Keep the `order-cta` class + `data-state`/`data-slot="cta-primary"` + the busy/done overlay spans (they rely on `.order-cta` CSS from Task 1). Change the button's visual classes from `gloss-cta ... text-white rounded-md py-5 ... text-[18px]` to:

```tsx
className="order-cta cta w-full py-5 px-6 flex items-center justify-center gap-4 text-[14px] tracking-[0.32em] uppercase relative cursor-pointer"
```

Keep the `cta-main` content (`Icon.Lock` + `Rush my order — {total}` + `Icon.Arrow`) and both overlay spans. Keep the not-charged note line and `<SecurityBadges />` below.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/OrderSummaryCard.tsx
git commit -m "feat: editorial order summary + flat ink CTA"
```

---

## Task 10: CheckoutPage layout reflow

**Files:**
- Modify: `src/pages/CheckoutPage.tsx`

- [ ] **Step 1: Reflow the page to hero + two-column grid (reference `App`, lines 596–663)**

Keep ALL state and handlers (`customer`, `shipping`, `isPaymentValid`, `selectedBundle`, `componentRef`, `handleComponentReady`, `useCheckoutPayment`, `handleSubmit`, `PaymentStatusDialog`). Change only the returned JSX layout:

```tsx
  return (
    <main data-page="checkout" className="max-w-[1200px] mx-auto px-8">
      <ProductHeroCard />

      <div className="grid lg:grid-cols-[1fr_minmax(420px,1fr)] gap-16 items-start border-t border-rule pt-12">
        {/* LEFT */}
        <section data-region="form-stack">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="smallcaps text-[10.5px] text-ink3">Step one</div>
              <h2 className="serif text-[34px] leading-none mt-1">Choose your supply.</h2>
            </div>
            <span className="text-[11.5px] text-ink3 font-light">
              Most order the <span className="text-ink2">Trio</span>.
            </span>
          </div>
          <div className="mt-7">
            <BundleSelector value={selectedBundle} onChange={setSelectedBundle} />
          </div>
          <GuaranteeCard />
          <ReviewsSection />
          <IngredientsPanel />
        </section>

        {/* RIGHT */}
        <aside data-region="summary" className="lg:sticky lg:top-[56px] lg:pl-8 lg:border-l lg:border-rule">
          <div className="smallcaps text-[10.5px] text-ink3 mb-2">Step two</div>
          <div className="flex items-baseline justify-between border-b border-rule pb-4">
            <h2 className="serif text-[26px] leading-none">Your details.</h2>
            <span className="smallcaps text-[10.5px] text-ink3 flex items-center gap-1.5">
              <Icon.Lock className="w-3 h-3" /> 256-bit secured
            </span>
          </div>

          <form onSubmit={handleSubmit} className="pt-7 space-y-9">
            <section data-section="customer-info">
              <SectionHead n="I" title="Contact" sub="" />
              <CustomerInfo value={customer} onChange={setCustomer} />
            </section>
            <section data-section="shipping-info">
              <SectionHead n="II" title="Shipping address" sub="" />
              <ShippingInfo value={shipping} onChange={setShipping} />
            </section>
            <section data-section="payment-info">
              <SectionHead n="III" title="Payment" sub="VISA · MC · AMEX · DISC" />
              <PaymentInfo
                customerEmail={customer.email || undefined}
                onValidityChange={setIsPaymentValid}
                onComponentReady={handleComponentReady}
              />
            </section>

            <OrderSummaryCard
              selectedBundle={selectedBundle}
              payDisabled={!isPaymentValid}
              payLoading={isProcessing}
            />

            <p className="text-center text-[11px] text-ink3 -mt-3 font-light">
              You will not be charged until you press the button above. Demo checkout — no real charges.
            </p>
          </form>
        </aside>
      </div>

      <PaymentStatusDialog status={status} error={error} result={result} onClose={reset} />
    </main>
  );
```

Remove the now-unused `ProductHeroCard` import duplication only if doubled; ensure `Icon` and `SectionHead` remain imported. Drop the old `gloss-forest` security header block.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CheckoutPage.tsx
git commit -m "feat: reflow CheckoutPage to editorial hero + two-column layout"
```

---

## Task 11: Thank-you page re-skin

**Files:**
- Modify: `src/pages/ThankYouPage.tsx`
- Modify: `src/components/thank-you/ThankYouHeader.tsx`
- Modify: `src/components/thank-you/OrderConfirmationCard.tsx`
- Modify: `src/components/thank-you/NextStepsCard.tsx`
- Modify: `src/components/thank-you/UpsellOfferBanner.tsx`
- Modify: `src/components/thank-you/UpsellCheckoutModal.tsx`

- [ ] **Step 1: Re-skin without touching logic**

Read each file first. Change ONLY presentation: swap `gloss-card`/`gloss-cta`/`gloss-forest`/boxed-input classes for the editorial equivalents — flat hairline containers (`border border-rule` / `.hr` separators), serif (`Cormorant`) headings, `smallcaps` labels, `num` for amounts/order numbers, and the flat `.cta` for primary buttons. Do NOT change the verify → poll → upsell logic, the `useThankYouPayment` wiring, status branches (`verifying`/`pending`/`succeeded`/`failed`), `data-*` markers, or the upsell POST flow.

- [ ] **Step 2: Apply the editorial vocabulary to each surface**
  - `ThankYouHeader`: ivory bg, serif confirmation headline, smallcaps order-number label, hairline divider.
  - `OrderConfirmationCard`: flat hairline panel, `dl` rows like the checkout summary, `num` totals, "Charge pending" badge stays but restyled as an umber smallcaps tag.
  - `NextStepsCard`: hairline list with serif-italic step heads.
  - `UpsellOfferBanner`: hairline framed banner, serif headline, flat `.cta` accept button, `num` countdown.
  - `UpsellCheckoutModal`: flat hairline modal surface, serif title, flat `.cta` confirm, `num` amount.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ThankYouPage.tsx src/components/thank-you/
git commit -m "feat: editorial re-skin of thank-you page + upsell surfaces"
```

---

## Task 12: Local verification (build, lint, preview)

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: PASS (no errors). Fix any unused-import / a11y issues introduced by the re-skin, then re-run.

- [ ] **Step 2: Start the full-stack preview**

Use the preview MCP tool `preview_start` with command `npm run preview` (full worker + D1 + iframe). `npm run dev` will NOT mount `/config`/`/payments`, so the iframe needs `preview`.

- [ ] **Step 3: Check console + network**

`preview_console_logs` and `preview_network`: expect no uncaught errors; `GET /config` returns 200 and the ConvesioPay iframe loads.

- [ ] **Step 4: Snapshot + screenshot the checkout**

`preview_snapshot` confirms: full-width hero, "Choose your supply" bundle rows with radio dots, guarantee/testimonials/ingredients, sticky "Your details." form with underline inputs, flat ink CTA. `preview_screenshot` for the visual record. `preview_resize` to confirm the grid collapses on mobile.

- [ ] **Step 5: Exercise the thank-you page**

Drive a test-card checkout (or navigate to `/thank-you?token=...` if a test token is available) and `preview_snapshot`/`preview_screenshot` the restyled succeeded/pending states + upsell banner.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: lint + preview adjustments for editorial redesign"
```

(Skip the commit if Steps 1–5 required no changes.)

---

## Task 13: Repoint git remote + rename Worker/D1 config

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `package.json`

- [ ] **Step 1: Repoint origin to the v3 repo (already exists on GitHub)**

```bash
git remote set-url origin git@github.com:Convesio-Inc/fulfillment-checkout-v3.git
git remote -v
```
Expected: both fetch/push show `fulfillment-checkout-v3.git`.

- [ ] **Step 2: Rename the Worker in `wrangler.jsonc`**

Change line 7 `"name": "fulfillment-checkout-v2"` → `"name": "fulfillment-checkout-v3"`.

- [ ] **Step 3: Rename the D1 `database_name` (id updated in Task 14)**

In the `d1_databases` block, change `"database_name": "fulfillment-checkout-v2"` → `"fulfillment-checkout-v3"`. Leave `database_id` for now (replaced after `d1 create`).

- [ ] **Step 4: Repoint the migration scripts in `package.json`**

Change `db:migrate` and `db:migrate:remote` to reference `fulfillment-checkout-v3` instead of `-v2`.

- [ ] **Step 5: Commit and push to the new remote**

```bash
git add wrangler.jsonc package.json
git commit -m "chore: repoint to fulfillment-checkout-v3 worker + D1 + remote"
git push -u origin main
```
Expected: push succeeds to `Convesio-Inc/fulfillment-checkout-v3`.

---

## Task 14: Create new D1 + deploy

**Files:**
- Modify: `wrangler.jsonc` (database_id)

- [ ] **Step 1: Authenticate Wrangler (if needed)**

Run: `npx wrangler whoami`
If not logged in: `npx wrangler login` (the user completes the browser auth). Confirm the account matches the intended Cloudflare account.

- [ ] **Step 2: Create the new D1 database**

Run: `npx wrangler d1 create fulfillment-checkout-v3`
Expected: prints a new `database_id` (UUID). It must differ from the v2 id `6bbbf02d-4b24-4f09-80d2-f53866c8e2e6`.

- [ ] **Step 3: Paste the new `database_id` into `wrangler.jsonc`**

Replace the `database_id` value in the `d1_databases` block with the UUID from Step 2.

- [ ] **Step 4: Apply migrations to the new remote D1**

Run: `npm run db:migrate:remote`
Expected: all migrations under `worker/db/migrations/` apply cleanly to `fulfillment-checkout-v3`.

- [ ] **Step 5: First deploy (bootstrap — `secrets.required` is already `[]`)**

Run: `npm run deploy`
Expected: builds and deploys a brand-new Worker `fulfillment-checkout-v3` with its own `*.workers.dev` URL.

- [ ] **Step 6: Push secrets to the deployed Worker (user provides values)**

Run: `npm run add-envs` (pushes `CPAY_API_KEY`, `CPAY_SECRET`, `CPAY_INTEGRATION`), then push the remaining secrets individually:

```bash
npx wrangler secret put AUTH_SALT
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put SENDGRID_API_KEY
npx wrangler secret put CARTROVER_API_USER
npx wrangler secret put CARTROVER_API_KEY
```
The user supplies each value when prompted.

- [ ] **Step 7: Restore the `secrets.required` list in `wrangler.jsonc`**

Replace `"required": []` with the full list from the file's comment:
`"CPAY_API_KEY", "CPAY_SECRET", "CPAY_INTEGRATION", "AUTH_SALT", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "SENDGRID_API_KEY", "CARTROVER_API_USER", "CARTROVER_API_KEY"`.

- [ ] **Step 8: Redeploy with secrets enforced + verify**

Run: `npm run deploy`
Expected: deploy succeeds with `required` enforced (all secrets present). Open the deployed URL, confirm the editorial checkout renders, `/config` returns 200, the iframe loads, and a test-card order redirects to the restyled thank-you page.

- [ ] **Step 9: Commit the final config**

```bash
git add wrangler.jsonc
git commit -m "chore: pin new D1 id + restore required secrets for v3 deploy"
git push
```

---

## Self-Review notes

- **Spec coverage:** tokens/CSS/fonts (T1), layout reflow (T10), all storefront components (T3–T9), thank-you (T11), wrangler rename (T13), package scripts (T13), git remote (T13), local test (T12), full deploy incl. D1 create + secrets (T14) — all spec sections mapped.
- **Subscription toggle:** T5 enforces visual-only (no mutation of `totalAmountMinor`), per the approved decision.
- **iframe preserved:** T8 Step 3 keeps the mount div and SDK wiring; only chrome changes.
- **Token aliasing:** T1 keeps legacy class names (`bone`/`line`/`amber`) as aliases to avoid a full rename churn, while adding `rule`/`umber`/`ink4`. Components may reference either; both resolve.
- **Marker preservation:** every component task says keep `data-*` and `// #region` markers.

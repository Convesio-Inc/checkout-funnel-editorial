/**
 * ProductHeroCard
 * -----------------------------------------------------------------------------
 * Top of the checkout's left column. SVG bottle on an ivory wash, serif product
 * title, short description, and a row of trust pills. All copy lives inline.
 *
 * Marker: data-section="product-hero"
 * -----------------------------------------------------------------------------
 */

import { Icon } from "@/components/icons";
import { Bottle } from "@/components/checkout/Bottle";

export function ProductHeroCard() {
  return (
    <section data-section="product-hero" className="grid sm:grid-cols-[minmax(280px,420px)_1fr] gap-8 sm:gap-12 items-end py-8 sm:py-12">
      <div className="wash flex items-end justify-center pt-6 pb-2 sm:pt-8 border border-line">
        <Bottle w={240} h={460} className="w-[160px] h-auto sm:w-[240px]"/>
      </div>
      <div className="pb-4">
        <div className="smallcaps text-[10.5px] text-ink3">N° 01 — Daily ritual</div>
        <h1 className="serif text-[52px] sm:text-[64px] md:text-[80px] leading-[0.92] tracking-[-0.01em] mt-3 text-ink">
          Daily Greens<br/>
          <span className="italic">Complex.</span>
        </h1>
        <p className="text-[14px] text-ink2 mt-5 leading-[1.65] max-w-[46ch] font-light">
          Thirty-two organic plants, adaptogens, and digestive enzymes — formulated in Portland, third-party tested, and made to replace the morning supplement stack in a single, unhurried scoop.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] text-ink3 font-light">
          <span className="inline-flex items-center gap-1.5"><Icon.Dot className="w-1.5 h-1.5 text-umber"/> NSF Certified</span>
          <span className="inline-flex items-center gap-1.5"><Icon.Dot className="w-1.5 h-1.5 text-umber"/> Non-GMO Project</span>
          <span className="inline-flex items-center gap-1.5"><Icon.Dot className="w-1.5 h-1.5 text-umber"/> Vegan · Gluten free</span>
          <span className="inline-flex items-center gap-1.5"><Icon.Dot className="w-1.5 h-1.5 text-umber"/> Plant-based capsules</span>
        </div>
      </div>
    </section>
  );
}

/**
 * GuaranteeCard
 * -----------------------------------------------------------------------------
 * The empty-bottle promise: circular Seal beside a serif headline, body
 * copy, and two reassurance bullets. All copy lives inline.
 *
 * Marker: data-section="guarantee"
 * -----------------------------------------------------------------------------
 */

import { Icon } from "@/components/icons";
import { Seal } from "@/components/checkout/Seal";

export function GuaranteeCard() {
  return (
    <section data-section="guarantee" aria-labelledby="guarantee-heading" className="grid sm:grid-cols-[120px_1fr] gap-6 sm:gap-8 py-8 sm:py-10 border-t border-line">
      <Seal />
      <div>
        <div className="smallcaps text-[10.5px] text-ink3">The Empty-Bottle Promise</div>
        <h3 id="guarantee-heading" className="serif italic text-[26px] sm:text-[34px] leading-[1.05] mt-2 text-ink max-w-[34ch]">
          A thirty-day return — even when the bottle is empty.
        </h3>
        <p className="text-[13.5px] text-ink2 mt-4 leading-[1.65] max-w-[58ch] font-light">
          Take it daily for thirty days. If you do not feel sharper, calmer, more even, return the bottles in any state — full, half, empty — and we will refund every dollar. No restocking, no friction, no questions about whether you tried it in earnest. The promise is the product.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-2 text-[11.5px] text-ink3">
          <span className="inline-flex items-center gap-2"><Icon.Check className="w-3.5 h-3.5" aria-hidden="true"/> Refunded within three business days</span>
          <span className="inline-flex items-center gap-2"><Icon.Check className="w-3.5 h-3.5" aria-hidden="true"/> Keep any complimentary gifts</span>
        </div>
      </div>
    </section>
  );
}

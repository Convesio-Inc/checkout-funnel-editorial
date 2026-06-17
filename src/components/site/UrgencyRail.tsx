/**
 * UrgencyRail
 * -----------------------------------------------------------------------------
 * Sticky top rail across all storefront pages. Shows live viewers, shipping/
 * tested/origin assurances, and an order-reserved countdown.
 *
 * Markers:
 *   - root            data-section="urgency-rail"
 *   - reserved timer  data-slot="reserved-timer"
 * -----------------------------------------------------------------------------
 */

import { useCountdown, useViewers } from "@/hooks/useStorefrontUrgency";

export function UrgencyRail() {
  const { mm, ss } = useCountdown(5 * 60);
  const viewers = useViewers();

  return (
    <div
      data-section="urgency-rail"
      className="sticky top-0 z-40 bg-bone border-b border-line"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 h-10 flex items-center justify-between text-[11.5px] text-ink2">
        <div className="flex items-center gap-3">
          <span className="livedot inline-flex w-1.5 h-1.5 rounded-full bg-umber"></span>
          <span>
            <span className="num text-ink">{viewers}</span> guests reviewing this offer
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6 smallcaps text-[10.5px] text-ink3">
          <span>Complimentary shipping</span>
          <span className="text-ink4">·</span>
          <span>Third-party tested</span>
          <span className="text-ink4">·</span>
          <span>Made in Oregon</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink3 hidden sm:inline smallcaps text-[10.5px]">Order reserved</span>
          <span
            data-slot="reserved-timer"
            className="num text-[12.5px] text-ink tracking-[0.04em]"
          >
            {mm}<span className="tick text-ink3">:</span>{ss}
          </span>
        </div>
      </div>
    </div>
  );
}

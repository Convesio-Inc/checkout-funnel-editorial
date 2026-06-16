/**
 * BundleSelector
 * -----------------------------------------------------------------------------
 * Editorial bundle rows + visual subscription toggle. The subscription toggle
 * changes the displayed price text but does NOT change the bundle object passed
 * to onChange — the actual ConvesioPay charge always uses the one-time price.
 *
 * Markers:
 *   - root   data-section="bundle-selector"
 * -----------------------------------------------------------------------------
 */

import { useState } from "react";
import { type Bundle, BUNDLES } from "@/components/checkout/bundles";

function bundleLabel(bottleCount: number): string {
  if (bottleCount === 1) return "Single";
  if (bottleCount === 2) return "Pair";
  return "Trio";
}

export function BundleSelector({ value, onChange }: { value: Bundle; onChange: (b: Bundle) => void }) {
  const [sub, setSub] = useState(false);

  return (
    <div data-section="bundle-selector">
      {/* SubToggle */}
      <div className="flex items-center justify-between border-y border-line py-3.5">
        <div className="smallcaps text-[10.5px] text-ink3">Replenishment</div>
        <div role="tablist" className="flex items-center gap-6 text-[12.5px]">
          <button
            type="button"
            role="tab"
            aria-selected={!sub}
            onClick={() => setSub(false)}
            className={"transition " + (!sub ? "text-ink" : "text-ink3 hover:text-ink2")}
          >
            <span className={!sub ? "border-b border-ink pb-0.5" : ""}>One-time order</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sub}
            onClick={() => setSub(true)}
            className={"transition flex items-center gap-2 " + (sub ? "text-ink" : "text-ink3 hover:text-ink2")}
          >
            <span className={sub ? "border-b border-ink pb-0.5" : ""}>Monthly replenishment</span>
            <span className="num text-[10.5px] text-umber">−20%</span>
          </button>
        </div>
      </div>

      {/* Bundle rows */}
      <div className="mt-1">
        {[...BUNDLES].reverse().map((b, i) => {
          const first = i === 0;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(b)}
              className={[
                "w-full text-left grid grid-cols-[28px_1fr_auto] items-baseline gap-x-5 px-1 py-6 transition",
                first ? "" : "border-t border-line",
                value.id === b.id ? "" : "hover:bg-[rgba(13,13,12,0.02)]",
              ].join(" ")}
              aria-pressed={value.id === b.id}
            >
              <span className="pt-1.5">
                <span className={"dot " + (value.id === b.id ? "on" : "")} aria-hidden="true"></span>
              </span>

              <span className="min-w-0">
                <span className="flex items-baseline gap-3 flex-wrap">
                  <span className="serif text-[28px] leading-none">{bundleLabel(b.bottleCount)}</span>
                  <span className="num text-[12px] text-ink3">{String(b.bottleCount).padStart(2, "0")}</span>
                  {b.isMostChosen && (
                    <span className="smallcaps text-[10px] text-umber border border-umber/40 px-1.5 py-0.5">
                      House Favourite
                    </span>
                  )}
                </span>
                <span className="block mt-1.5 text-[12.5px] text-ink3 font-light tracking-wide">
                  {b.supplyLabel}
                  {(b.savingsMinor ?? 0) > 0 && (
                    <> · You save <span className="num text-ink2">${((b.savingsMinor ?? 0) / 100).toFixed(0)}</span></>
                  )}{" "}
                  · Complimentary shipping
                </span>
              </span>

              <span className="text-right whitespace-nowrap">
                <span className="num text-[20px] text-ink leading-none">
                  ${sub ? (b.pricePerBottle * 0.8).toFixed(2) : b.pricePerBottle.toFixed(2)}
                </span>
                <span className="block mt-1 smallcaps text-[10px] text-ink3">per bottle</span>
                <span className="block mt-2 num text-[11.5px] text-ink3">
                  {(sub || b.originalAmountMinor !== b.totalAmountMinor) && (
                    <span className="line-through mr-1.5">${(b.originalAmountMinor / 100).toFixed(2)}</span>
                  )}
                  <span className="text-ink2">
                    ${sub ? ((b.totalAmountMinor / 100) * 0.8).toFixed(2) : (b.totalAmountMinor / 100).toFixed(2)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

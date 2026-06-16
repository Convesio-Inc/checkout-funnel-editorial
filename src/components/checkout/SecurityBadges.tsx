/**
 * SecurityBadges
 * -----------------------------------------------------------------------------
 * Quiet trust strip — six inline badges, flat hairline border, no gloss.
 *
 * Marker: data-section="trust-badges"
 * -----------------------------------------------------------------------------
 */

import { Icon } from "@/components/icons";

const BADGES: { icon: "lock" | "check"; label: string }[] = [
  { icon: "lock",  label: "256-bit encrypted checkout" },
  { icon: "check", label: "30-day empty-bottle return" },
  { icon: "check", label: "Complimentary shipping" },
  { icon: "lock",  label: "Secure payment via ConvesioPay" },
  { icon: "check", label: "No subscription — ever" },
  { icon: "check", label: "Certified organic inputs" },
];

export function SecurityBadges() {
  return (
    <div
      data-section="trust-badges"
      className="border-t border-line py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3"
    >
      {BADGES.map((b) => (
        <span key={b.label} className="inline-flex items-center gap-2 smallcaps text-[10px] text-ink3">
          {b.icon === "lock" ? (
            <Icon.Lock className="w-3 h-3" aria-hidden="true" />
          ) : (
            <Icon.Check className="w-3 h-3" aria-hidden="true" />
          )}
          {b.label}
        </span>
      ))}
    </div>
  );
}

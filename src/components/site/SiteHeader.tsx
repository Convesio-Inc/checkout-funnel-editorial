/**
 * SiteHeader
 * -----------------------------------------------------------------------------
 * Meridian masthead: wordmark on the left, section nav in the center, a
 * "secure" assurance on the right. Not sticky — only the UrgencyRail above it
 * pins to the top.
 * -----------------------------------------------------------------------------
 */

import { Icon } from "@/components/icons";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
        <a href="#" className="serif text-[26px] tracking-[0.04em] leading-none">
          Meridian
          <span className="block text-[9px] smallcaps text-ink3 mt-1 font-sans tracking-[0.32em]">
            Botanicals · Est. 2019
          </span>
        </a>
        <nav aria-label="Site navigation" className="hidden md:flex items-center gap-9 text-[12.5px] text-ink2">
          <a href="#" className="hover:text-ink">Apothecary</a>
          <a href="#" className="hover:text-ink">Science</a>
          <a href="#" className="hover:text-ink">Journal</a>
          <a href="#" className="hover:text-ink">The Guarantee</a>
        </nav>
        <div className="flex items-center gap-2 smallcaps text-[10.5px] text-ink3">
          <Icon.Lock className="w-3.5 h-3.5" />
          Secure
        </div>
      </div>
    </header>
  );
}

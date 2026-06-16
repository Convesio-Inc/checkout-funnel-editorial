/**
 * SiteFooter
 * -----------------------------------------------------------------------------
 * Quiet storefront footer: brand address, policy links, secure-checkout
 * assurance. Three-column editorial grid on md+, stacked on mobile.
 * -----------------------------------------------------------------------------
 */

import { Icon } from "@/components/icons";

export function SiteFooter() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-[1200px] mx-auto px-8 py-10 grid md:grid-cols-3 gap-8 items-start text-[11.5px] text-ink3 font-light">
        <div>
          <div className="serif text-[18px] text-ink leading-none">Meridian Botanicals</div>
          <div className="mt-2">126 SE Stark Street · Portland, Oregon</div>
          <div>© 2026 — all formulas, original.</div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <a href="#" className="hover:text-ink">Privacy</a>
          <a href="#" className="hover:text-ink">Terms</a>
          <a href="#" className="hover:text-ink">Refunds</a>
          <a href="#" className="hover:text-ink">Wholesale</a>
          <a href="#" className="hover:text-ink">Contact</a>
        </div>
        <div className="flex md:justify-end items-center gap-2 smallcaps text-[10.5px]">
          <Icon.Lock className="w-3 h-3" /> Secure checkout
        </div>
      </div>
    </footer>
  );
}

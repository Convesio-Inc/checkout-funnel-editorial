export function SiteFooter() {
  return (
    <footer className="bg-white border-t border-[#e4ddd2]">
      <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 py-[18px] flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#888]">
        <span>© 2026 Your Brand — All rights reserved.</span>
        <nav className="flex items-center gap-4">
          <a href="#" className="hover:text-[#1a3028] transition-colors">Privacy</a>
          <a href="#" className="hover:text-[#1a3028] transition-colors">Terms</a>
          <a href="#" className="hover:text-[#1a3028] transition-colors">Refunds</a>
          <a href="#" className="hover:text-[#1a3028] transition-colors">Contact</a>
        </nav>
        <span className="flex items-center gap-1">🔒 Secure checkout</span>
      </div>
    </footer>
  );
}

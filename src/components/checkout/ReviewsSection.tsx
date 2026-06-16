/**
 * ReviewsSection
 * -----------------------------------------------------------------------------
 * Three inline testimonials in a horizontal row; stacks on mobile.
 * Editorial: flat borders, serif headline, no gloss.
 *
 * Marker: data-section="reviews"
 * -----------------------------------------------------------------------------
 */

const TESTIMONIALS = [
  {
    stars: "★★★★★",
    quote:
      "I have tried every green powder on the market. This is the first one I actually look forward to. No grit, no grass. Just clarity.",
    attribution: "— ELEANOR V., PORTLAND",
  },
  {
    stars: "★★★★★",
    quote:
      "Two months in. My digestion is better, my energy is steadier, and I no longer need a second coffee at noon. Real results.",
    attribution: "— MARCUS T., BROOKLYN",
  },
  {
    stars: "★★★★★",
    quote:
      "The bottle alone makes me feel like I'm taking care of myself. The formula backs it up. I will not run out again.",
    attribution: "— SARAH K., SAN FRANCISCO",
  },
];

export function ReviewsSection() {
  return (
    <div data-section="reviews" className="border-t border-line pt-10 pb-4">
      <div className="smallcaps text-[10.5px] text-ink3">Verified Purchasers</div>
      <div className="serif italic text-[38px] text-ink mt-2 leading-none">What they said.</div>

      <div className="mt-8 grid md:grid-cols-3 gap-8 border-t border-line pt-8">
        {TESTIMONIALS.map((t) => (
          <div key={t.attribution}>
            <div className="text-umber text-[11px] tracking-[0.2em]">{t.stars}</div>
            <p className="text-[13.5px] text-ink2 leading-[1.65] mt-3 font-light italic">
              {t.quote}
            </p>
            <div className="mt-3 smallcaps text-[10px] text-ink3">{t.attribution}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

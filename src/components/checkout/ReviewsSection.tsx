/**
 * ReviewsSection
 * -----------------------------------------------------------------------------
 * Three editorial pull-quotes in a horizontal row; stacks on mobile.
 * Matches the reference Testimonials() component exactly.
 *
 * Marker: data-section="reviews"
 * -----------------------------------------------------------------------------
 */

const TESTIMONIALS = [
  {
    quote: "Sharper by the second week — and I never remember vitamins.",
    name: "Priya R.",
    location: "Austin, Texas",
  },
  {
    quote: "The first greens powder that does not taste like pond water.",
    name: "Daniel K.",
    location: "Brooklyn, New York",
  },
  {
    quote: "Refunded me without making it weird. I re-ordered a month later.",
    name: "Lena S.",
    location: "Denver, Colorado",
  },
];

export function ReviewsSection() {
  return (
    <section data-section="reviews" aria-label="Customer reviews" className="border-t border-line py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
        <div>
          <div className="smallcaps text-[10.5px] text-ink3">From the cabinet</div>
          <h3 className="serif text-[28px] leading-none mt-1">Notes from our readers.</h3>
        </div>
        <div className="text-right">
          <div className="num text-[20px]">4.86</div>
          <div className="smallcaps text-[10px] text-ink3 mt-1">12,408 verified · five stars</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-12">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name}>
            <blockquote className="serif italic text-[18px] sm:text-[22px] leading-[1.25] text-ink">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-4 smallcaps text-[10.5px] text-ink3">
              <span className="text-ink2">{t.name}</span> &nbsp;—&nbsp; {t.location}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

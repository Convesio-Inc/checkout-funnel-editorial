/**
 * IngredientsPanel
 * -----------------------------------------------------------------------------
 * Four grouped ingredient columns matching the reference Ingredients() component.
 * Each column has a serif italic group heading and a dash-prefixed ingredient list.
 *
 * Marker: data-section="ingredients"
 * -----------------------------------------------------------------------------
 */

const GROUPS: { head: string; list: string[] }[] = [
  {
    head: "Adaptogens",
    list: ["Ashwagandha KSM-66", "Reishi", "Rhodiola", "L-Theanine"],
  },
  {
    head: "Greens",
    list: ["Spirulina", "Chlorella", "Spinach", "Kale", "Matcha"],
  },
  {
    head: "Roots & spice",
    list: ["Beetroot", "Turmeric", "Ginger", "Maca"],
  },
  {
    head: "Digestion",
    list: ["Probiotic blend", "Inulin", "Bromelain", "Papain"],
  },
];

export function IngredientsPanel() {
  return (
    <section data-section="ingredients" aria-label="Ingredients" className="border-t border-line py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-8">
        <h3 className="serif text-[28px] leading-none">Inside the formula.</h3>
        <div className="smallcaps text-[10.5px] text-ink3">32 organic ingredients · USDA</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-10 gap-y-6">
        {GROUPS.map((col) => (
          <div key={col.head}>
            <div className="serif italic text-[18px] text-ink mb-2">{col.head}</div>
            <ul className="space-y-1.5">
              {col.list.map((item) => (
                <li key={item} className="text-[12.5px] text-ink2 font-light flex items-baseline gap-2">
                  <span className="text-ink4">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

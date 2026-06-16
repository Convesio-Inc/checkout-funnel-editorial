/**
 * IngredientsPanel
 * -----------------------------------------------------------------------------
 * Editorial ingredients list — 4-column grid, flat borders, serif headline.
 * No gloss, no colour fills.
 *
 * Marker: data-section="ingredients"
 * -----------------------------------------------------------------------------
 */

const INGREDIENTS: { name: string; benefit: string }[] = [
  { name: "Spirulina",     benefit: "Cellular energy" },
  { name: "Chlorella",     benefit: "Detox support" },
  { name: "Wheatgrass",    benefit: "Alkalising" },
  { name: "Barley grass",  benefit: "Antioxidant" },
  { name: "Matcha",        benefit: "Mental focus" },
  { name: "Ashwagandha",   benefit: "Stress buffer" },
  { name: "Rhodiola",      benefit: "Endurance" },
  { name: "Lion's mane",   benefit: "Cognition" },
  { name: "Reishi",        benefit: "Immune tone" },
  { name: "Chaga",         benefit: "Inflammation" },
  { name: "Ginger root",   benefit: "Digestion" },
  { name: "Fennel seed",   benefit: "Bloat relief" },
  { name: "Peppermint",    benefit: "Gut motility" },
  { name: "Black pepper",  benefit: "Bioavailability" },
  { name: "Turmeric",      benefit: "Anti-inflammatory" },
  { name: "Vitamin C",     benefit: "Immunity" },
];

export function IngredientsPanel() {
  return (
    <div data-section="ingredients" className="border-t border-line py-10">
      <div className="flex items-baseline justify-between">
        <span className="smallcaps text-[10.5px] text-ink3">Formula</span>
        <span className="smallcaps text-[10.5px] text-ink3">32 organic inputs</span>
      </div>
      <div className="serif italic text-[38px] text-ink mt-2 leading-none">What's inside.</div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-0 border-t border-line pt-6">
        {INGREDIENTS.map((item) => (
          <div
            key={item.name}
            className="py-2.5 border-b border-line flex items-baseline justify-between text-[12.5px]"
          >
            <span className="text-ink2 font-light">{item.name}</span>
            <span className="text-ink3 text-[11px]">{item.benefit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

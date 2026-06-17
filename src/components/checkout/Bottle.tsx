/**
 * Bottle
 * -----------------------------------------------------------------------------
 * SVG-drawn apothecary bottle used in the product hero (large, w=240 h=460)
 * and bundle row thumbnails (small, w=20 h=42). `ghost` renders a faded
 * cream-stroke silhouette for the "bonus bottles" position.
 * -----------------------------------------------------------------------------
 */

export interface BottleProps {
  w?: number;
  h?: number;
  ghost?: boolean;
  className?: string;
}

export function Bottle({ w = 200, h = 420, ghost = false, className }: BottleProps) {
  return (
    <svg width={w} height={h} viewBox="0 0 200 420" aria-hidden="true" className={className}>
      <g opacity={ghost ? 0.25 : 1}>
        {/* shadow */}
        <ellipse cx="100" cy="410" rx="68" ry="4" fill="#0d0d0c" opacity={ghost ? 0.05 : 0.08}/>
        {/* cap */}
        <rect x="60" y="20" width="80" height="34" fill="#0d0d0c"/>
        <line x1="60" y1="44" x2="140" y2="44" stroke="#3a3a36" strokeWidth="1"/>
        {/* neck */}
        <rect x="72" y="54" width="56" height="14" fill="#1b3326"/>
        {/* body — deep green apothecary glass */}
        <path d="M48 68 h104 v20 q0 8 -10 14 v258 q0 18 -18 18 h-48 q-18 0 -18 -18 v-258 q-10 -6 -10 -14 z"
              fill={ghost ? "transparent" : "#1b3326"}
              stroke={ghost ? "#c9c4b1" : "#0d0d0c"} strokeWidth="0.8"/>
        {!ghost && (
          <>
            {/* glass highlights */}
            <path d="M60 110 v240" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="3" strokeLinecap="round"/>
            <path d="M68 116 v228" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1.2"/>
            {/* label — paper ivory */}
            <rect x="56" y="160" width="88" height="160" fill="#f4f1e8"/>
            <line x1="56" y1="160" x2="144" y2="160" stroke="#0d0d0c" strokeWidth="0.6"/>
            <line x1="56" y1="320" x2="144" y2="320" stroke="#0d0d0c" strokeWidth="0.6"/>
            {/* label content */}
            <text x="100" y="186" textAnchor="middle" fontFamily="Cormorant Garamond" fontStyle="italic" fontWeight="400" fontSize="22" fill="#0d0d0c">Meridian</text>
            <line x1="84" y1="196" x2="116" y2="196" stroke="#0d0d0c" strokeWidth="0.5"/>
            <text x="100" y="222" textAnchor="middle" fontFamily="Geist" fontWeight="500" fontSize="9" fill="#0d0d0c" letterSpacing="2">DAILY GREENS</text>
            <text x="100" y="235" textAnchor="middle" fontFamily="Geist" fontWeight="500" fontSize="9" fill="#0d0d0c" letterSpacing="2">COMPLEX</text>
            <text x="100" y="262" textAnchor="middle" fontFamily="Geist" fontWeight="400" fontSize="7" fill="#787870" letterSpacing="1.4">32 ORGANIC PLANTS</text>
            <text x="100" y="274" textAnchor="middle" fontFamily="Geist" fontWeight="400" fontSize="7" fill="#787870" letterSpacing="1.4">·  ADAPTOGENS  ·</text>
            <text x="100" y="286" textAnchor="middle" fontFamily="Geist" fontWeight="400" fontSize="7" fill="#787870" letterSpacing="1.4">DIGESTIVE ENZYMES</text>
            <text x="100" y="310" textAnchor="middle" fontFamily="Geist Mono" fontWeight="500" fontSize="7" fill="#0d0d0c" letterSpacing="1.5">NET WT. 240G</text>
            <rect x="92" y="295" width="16" height="6" fill="#8c4a1c"/>
          </>
        )}
      </g>
    </svg>
  );
}

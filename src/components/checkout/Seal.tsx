/**
 * Seal
 * -----------------------------------------------------------------------------
 * Circular guarantee stamp drawn as SVG. Text follows a curved path.
 * Used by GuaranteeCard.
 * -----------------------------------------------------------------------------
 */

export function Seal() {
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
      <g transform="translate(50 50)">
        <defs>
          <path id="stampcurve" d="M -34 0 a 34 34 0 1 1 68 0 a 34 34 0 1 1 -68 0"/>
        </defs>
        <circle r="46" fill="none" stroke="#0d0d0c" strokeWidth="0.6"/>
        <circle r="40" fill="none" stroke="#0d0d0c" strokeWidth="0.4"/>
        <circle r="40" fill="none" stroke="#0d0d0c" strokeWidth="0.3" strokeDasharray="0.4 3"/>
        <text fontFamily="Geist" fontWeight="500" fontSize="7" letterSpacing="3" fill="#0d0d0c">
          <textPath href="#stampcurve" startOffset="0">MERIDIAN BOTANICALS · GUARANTEE · MERIDIAN BOTANICALS · GUARANTEE ·</textPath>
        </text>
        <text textAnchor="middle" y="-2" fontFamily="Cormorant Garamond" fontStyle="italic" fontSize="22" fill="#0d0d0c">30</text>
        <text textAnchor="middle" y="12" fontFamily="Geist" fontSize="6.5" letterSpacing="2.5" fill="#0d0d0c">DAY RETURN</text>
      </g>
    </svg>
  );
}

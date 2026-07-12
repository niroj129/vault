/* Angular "TF" monogram inspired by the Tiffany Gaming brand mark. */
export default function Logo({ size = 40 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 100 100"
      fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Tiffany Gaming">
      <defs>
        <linearGradient id="tf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1475E1" />
          <stop offset="1" stopColor="#0F212E" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="22" fill="url(#tf)"
        stroke="#00E701" strokeWidth="2" />
      {/* T bar */}
      <polygon points="18,26 62,26 55,38 38,38 38,74 26,74 26,38 18,38"
        fill="#00E701" />
      {/* F merged on the right */}
      <polygon points="58,26 84,26 84,38 66,38 66,48 80,48 80,59 66,59 66,74 54,74 54,38 58,34"
        fill="#ffffff" />
    </svg>
  );
}

const RINGS = [
  { r: 56, color: "var(--calories)" },
  { r: 42, color: "var(--protein)" },
  { r: 28, color: "var(--steps)" },
];

export function Rings({ values }: { values: [number, number, number] }) {
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true" className="flex-none">
      {RINGS.map(({ r, color }, i) => {
        const c = 2 * Math.PI * r;
        const p = Math.max(0, Math.min(1, values[i]));
        return (
          <g key={r}>
            <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeOpacity="0.22" strokeWidth="12" />
            <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 66 66)" />
          </g>
        );
      })}
    </svg>
  );
}

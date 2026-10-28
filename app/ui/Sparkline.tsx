export const SPARK = { w: 58, h: 22, pad: 3 };

/** The polyline's points, oldest to newest. A flat run sits in the middle. */
export function sparkPoints(values: number[]): [number, number][] {
  const { w, h, pad } = SPARK;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1), hi === lo ? h / 2 : h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo)]);
}

/** Top weight per session, the last point in ink (All lifts, option 6A). Under 2 sessions it keeps its space empty. */
export function Sparkline({ values }: { values: number[] }) {
  const { w, h } = SPARK;
  if (values.length < 2) return <span aria-hidden="true" className="w-[58px] flex-none" />;
  const pts = sparkPoints(values);
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="flex-none">
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r="3" fill="var(--ink)" />
    </svg>
  );
}

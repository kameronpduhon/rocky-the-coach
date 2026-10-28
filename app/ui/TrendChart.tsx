import { useEffect, useRef, useState } from "react";
import { daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";

export interface TrendPoint {
  date: ISODate;
  weight: number | null;
  /** Unrounded, so the line slopes instead of stepping by tenths. Round only labels. */
  trend: number | null;
}

/** The check-in's short chart, and Progress's tall one (mock `Progress`: 190 high, whole-pound bounds). */
const SHAPE = {
  short: { H: 110, TOP: 6, PLOT_H: 94, dot: 3 },
  tall: { H: 190, TOP: 8, PLOT_H: 166, dot: 2.5 },
};

/**
 * Whole-pound bounds around every plotted value, so the dots, the line and the goal band sit inside. The step doubles
 * until there are at most 4 bands.
 */
export function yScale(min: number, max: number) {
  let step = 1;
  let lo = Math.floor(min - 0.1);
  let hi = Math.ceil(max + 0.1);
  while ((hi - lo) / step > 4) {
    step *= 2;
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
  }
  const ticks: number[] = [];
  for (let t = hi; t >= lo; t -= step) ticks.push(t);
  return { lo, hi, ticks };
}

/**
 * Dots for weigh-ins, the trend line and its end dot (the check-in and Progress). Optional: a dashed marker at a date
 * (the check-in's Monday), and on Progress the goal band at the goal date and a dashed pace line from the trend's end
 * to where it lands.
 */
export function TrendChart({
  points,
  label,
  marker = null,
  tall = false,
  goal = null,
  projection = null,
}: {
  points: TrendPoint[];
  label: string;
  marker?: ISODate | null;
  tall?: boolean;
  goal?: { date: ISODate; low: number; high: number } | null;
  projection?: { date: ISODate; weight: number } | null;
}) {
  // Real pixels, so the dots stay round on wide screens.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(350);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { H, TOP, PLOT_H, dot } = SHAPE[tall ? "tall" : "short"];
  const plotted = points.flatMap((p) => [p.weight, p.trend]).filter((v): v is number => v !== null);
  const values = [...plotted, ...(goal ? [goal.low, goal.high] : []), ...(projection ? [projection.weight] : [])];
  const empty = tall ? !points.some((p) => p.weight !== null) : points.length < 2 || plotted.length < 2;
  if (empty) return <p className={`text-[15px] text-ink-3 ${tall ? "py-8 text-center" : "py-6"}`}>Weigh in a few days to see your trend.</p>;
  const first = points[0].date;
  const last = [points.at(-1)!.date, goal?.date, projection?.date].filter((d): d is ISODate => Boolean(d)).sort().at(-1)!;
  const span = Math.max(1, daysBetween(first, last));
  const { lo, hi } = tall ? yScale(Math.min(...values), Math.max(...values)) : { lo: Math.min(...values), hi: Math.max(...values) };
  const x = (d: ISODate) => 4 + (daysBetween(first, d) / span) * (W - 8);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo || 1)) * PLOT_H;
  const line = points.filter((p) => p.trend !== null);
  const end = line.at(-1);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
        {goal && <rect x={x(goal.date) - 32} y={y(goal.high)} width="32" height={y(goal.low) - y(goal.high)} fill="var(--well)" />}
        <line x1="0" x2={W} y1={H - (tall ? 8 : 4)} y2={H - (tall ? 8 : 4)} stroke="var(--rule)" />
        {marker && <line x1={x(marker)} x2={x(marker)} y1={TOP - 2} y2={H - 4} stroke="var(--underline)" strokeDasharray="3 4" />}
        {points.map((p) => (p.weight !== null ? <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r={dot} fill="var(--border)" /> : null))}
        {line.length > 1 && (
          <polyline
            points={line.map((p) => `${x(p.date).toFixed(1)},${y(p.trend!).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {end && projection && <line x1={x(end.date)} y1={y(end.trend!)} x2={x(projection.date)} y2={y(projection.weight)} stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 6" />}
        {end && <circle cx={x(end.date)} cy={y(end.trend!)} r="5" fill="var(--ink)" />}
      </svg>
    </div>
  );
}

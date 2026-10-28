import { useEffect, useRef, useState } from "react";
import { daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";

export interface TrendPoint {
  date: ISODate;
  weight: number | null;
  trend: number | null;
}

const H = 110;
const TOP = 6;
const PLOT_H = 94;

/** Dots for weigh-ins, the trend line and its end dot, and an optional dashed marker at a date (the check-in's Monday). */
export function TrendChart({ points, label, marker = null }: { points: TrendPoint[]; label: string; marker?: ISODate | null }) {
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
  const values = points.flatMap((p) => [p.weight, p.trend]).filter((v): v is number => v !== null);
  if (points.length < 2 || values.length < 2) return <p className="py-6 text-[15px] text-ink-3">Weigh in a few days to see your trend.</p>;
  const first = points[0].date;
  const span = Math.max(1, daysBetween(first, points.at(-1)!.date));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (d: ISODate) => 4 + (daysBetween(first, d) / span) * (W - 8);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo || 1)) * PLOT_H;
  const line = points.filter((p) => p.trend !== null);
  const end = line.at(-1);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
        <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="var(--rule)" />
        {marker && <line x1={x(marker)} x2={x(marker)} y1={TOP - 2} y2={H - 4} stroke="var(--underline)" strokeDasharray="3 4" />}
        {points.map((p) => (p.weight !== null ? <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="3" fill="var(--border)" /> : null))}
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
        {end && <circle cx={x(end.date)} cy={y(end.trend!)} r="5" fill="var(--ink)" />}
      </svg>
    </div>
  );
}

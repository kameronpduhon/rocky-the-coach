import { useEffect, useRef, useState } from "react";

type Point = { date: string; weight: number | null; avg: number | null };

const H = 170;
const LEFT = 34;
const TOP = 10;
const PLOT_H = 136;

const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function WeightChart({ series }: { series: Point[] }) {
  // Draw in real pixels so labels keep their 11 px size on wide screens instead of scaling with the viewBox.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(350);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const values = series.flatMap((p) => [p.weight, p.avg]).filter((v): v is number => v !== null);
  if (values.length < 2) return <p className="py-8 text-center text-[15px] text-label-2">Weigh in a few days to see your trend.</p>;
  const lo = Math.min(...values) - 0.3;
  const hi = Math.max(...values) + 0.3;
  const x = (i: number) => LEFT + 5 + (i * (W - LEFT - 16)) / Math.max(1, series.length - 1);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * PLOT_H;
  const step = Math.max(1, Math.ceil((Math.floor(hi) - Math.ceil(lo)) / 3));
  const ticks: number[] = [];
  for (let t = Math.floor(hi); t >= Math.ceil(lo); t -= step) ticks.push(t);
  const avgPoints = series
    .map((p, i) => (p.avg !== null ? `${x(i).toFixed(1)},${y(p.avg).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  const lastAvgIndex = series.findLastIndex((p) => p.avg !== null);
  const weights = series.map((p) => p.weight).filter((v): v is number => v !== null);
  const summary =
    `Weight from ${label(series[0].date)} to ${label(series.at(-1)!.date)}.` +
    (weights.length ? ` Daily weigh-ins range from ${Math.min(...weights)} to ${Math.max(...weights)} pounds.` : "") +
    (lastAvgIndex >= 0 ? ` The 7-day average is ${series[lastAvgIndex].avg} pounds.` : "");

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} className="tabular">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="var(--fill)" />
            <text x="0" y={y(t) + 4} fill="var(--label-3)" fontSize="11">
              {t}
            </text>
          </g>
        ))}
        {series.map((p, i) => (p.weight !== null ? <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="3" fill="var(--chart-dot)" /> : null))}
        <polyline fill="none" stroke="var(--protein)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={avgPoints} />
        {lastAvgIndex >= 0 && <circle cx={x(lastAvgIndex)} cy={y(series[lastAvgIndex].avg!)} r="5" fill="var(--protein)" stroke="var(--card)" strokeWidth="2" />}
        <text x={x(0)} y={H - 6} fill="var(--label-3)" fontSize="11">
          {label(series[0].date)}
        </text>
        {series.length > 1 && (
          <text x={x(series.length - 1)} y={H - 6} fill="var(--label-3)" fontSize="11" textAnchor="end">
            {label(series.at(-1)!.date)}
          </text>
        )}
      </svg>
    </div>
  );
}

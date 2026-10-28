import type { ReactNode } from "react";

export interface Stat {
  /** Left out for a cell under a section head that already names it. */
  label?: string;
  value: ReactNode;
  sub?: ReactNode;
  /** When the value is a field, the label names it. */
  labelFor?: string;
}

/**
 * The ruled grid of label, big number and subline: the check-in's 2 × 2, Plan's targets, Progress's pairs and row.
 * `ruled` draws the 2 px ink rule on top, for a grid with no section head over it.
 */
export function StatGrid({ label, cells, columns, ruled = true }: { label: string; cells: Stat[]; columns: 2 | 3; ruled?: boolean }) {
  return (
    <section aria-label={label} className={`grid ${ruled ? "border-t-2 border-t-ink" : ""}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => {
        const col = i % columns;
        const last = col === columns - 1;
        return (
          <div key={i} className={`flex min-w-0 flex-col gap-0.5 border-b border-b-rule pb-3.5 pt-3 ${col === 0 ? "pr-3" : last ? "pl-3.5" : "px-3"} ${last ? "" : "border-r border-r-rule"}`}>
            {c.label &&
              (c.labelFor ? (
                <label htmlFor={c.labelFor} className="text-[14px] font-semibold text-ink-3">
                  {c.label}
                </label>
              ) : (
                <span className="text-[14px] font-semibold text-ink-3">{c.label}</span>
              ))}
            <div className="tabular font-num text-[32px] font-bold leading-[1.05]">{c.value}</div>
            {c.sub && <span className="text-[14px] text-ink-3">{c.sub}</span>}
          </div>
        );
      })}
    </section>
  );
}

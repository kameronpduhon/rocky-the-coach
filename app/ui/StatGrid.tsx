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
        // Three across is tighter in the mocks (Plan's targets, Progress's showing-up row), so its sublines fit one line.
        const pad = columns === 3 ? (col === 0 ? "pr-2" : last ? "pl-2.5" : "px-2") : col === 0 ? "pr-3" : last ? "pl-3.5" : "px-3";
        return (
          <div key={i} className={`flex min-w-0 flex-col gap-0.5 border-b border-b-rule pb-3.5 pt-3 ${pad} ${last ? "" : "border-r border-r-rule"}`}>
            {c.label &&
              (c.labelFor ? (
                <label htmlFor={c.labelFor} className="text-[14px] font-semibold text-ink-3">
                  {c.label}
                </label>
              ) : (
                <span className="text-[14px] font-semibold text-ink-3">{c.label}</span>
              ))}
            <div className={`tabular font-num font-bold leading-[1.05] ${columns === 3 ? "text-[28px]" : "text-[32px]"}`}>{c.value}</div>
            {c.sub && <span className={`text-ink-3 ${columns === 3 ? "text-[13px]" : "text-[14px]"}`}>{c.sub}</span>}
          </div>
        );
      })}
    </section>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { MoveSheet } from "~/components/MoveSheet";
import { Icon } from "~/components/ui";
import { LinkCard } from "~/ui/LinkCard";
import { Poster } from "~/ui/Poster";
import { SectionHead } from "~/ui/SectionHead";
import { StatGrid } from "~/ui/StatGrid";
import { DaySheet } from "./DaySheet";
import type { PhaseCell, PlanDay, PlanModel } from "./model";

// The deload's hatch, drawn in the mock's colours: on-ink-2 in the cell, underline in the legend's swatch.
const HATCH = { backgroundImage: "repeating-linear-gradient(135deg, var(--on-ink-2) 0 3px, transparent 3px 7px)" };
const HATCH_SMALL = { backgroundImage: "repeating-linear-gradient(135deg, var(--underline) 0 2px, transparent 2px 5px)" };

function cellLabel(c: PhaseCell): string {
  const type = c.type === "checkpoint" ? ", January 1 checkpoint" : c.type === "standard" ? "" : `, ${c.type}`;
  return `Week ${c.n}${type}${c.state === "current" ? ", this week" : c.state === "done" ? ", done" : ""}`;
}

function cellClass(c: PhaseCell): string {
  const base = "flex h-10 items-center justify-center rounded-[3px]";
  if (c.state === "done") return `${base} bg-ink`;
  if (c.state === "current") return `${base} border-[2.5px] border-red`;
  if (c.type === "checkpoint") return `${base} border-2 border-ink`;
  if (c.type === "maintenance") return `${base} border-[1.5px] border-border bg-well`;
  return `${base} border-[1.5px] border-border`;
}

function Flag() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      <path d="M5 3h2v18H5zM7 4h11l-2.5 4L18 12H7z" />
    </svg>
  );
}

function PhaseStrip({ m }: { m: PlanModel }) {
  return (
    <section aria-label={`${m.cells.length}-week phase`} className="flex flex-col gap-2.5">
      <ol className="grid gap-[3px] text-center font-num text-[12px] font-bold" style={{ gridTemplateColumns: `repeat(${m.cells.length}, minmax(0, 1fr))` }}>
        {m.cells.map((c) => (
          <li
            key={c.n}
            aria-label={cellLabel(c)}
            aria-current={c.state === "current" ? "step" : undefined}
            className={`flex flex-col gap-1 ${c.state === "current" ? "text-red" : c.state === "ahead" ? "text-ink-3" : ""}`}
          >
            <span className={cellClass(c)} style={c.state === "ahead" && c.type === "deload" ? HATCH : undefined}>
              {c.state === "ahead" && c.type === "checkpoint" && <Flag />}
            </span>
            <span aria-hidden="true">{c.n}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-ink-2">
        {m.legend.map((l) => (
          <span key={l.text} className="flex items-center gap-1.5">
            {l.type === "deload" && <span aria-hidden="true" className="size-3 border-[1.5px] border-border" style={HATCH_SMALL} />}
            {l.type === "maintenance" && <span aria-hidden="true" className="size-3 border-[1.5px] border-border bg-well" />}
            {l.text}
          </span>
        ))}
      </div>
    </section>
  );
}

function DayRow({ d, past, onOpen }: { d: PlanDay; past: boolean; onOpen: (d: PlanDay) => void }) {
  const body = (
    <>
      <span className={`w-[42px] flex-none font-num text-[15px] font-bold ${d.today ? "text-red" : "text-ink-3"}`}>{d.weekday}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={d.today ? "text-[17px] font-bold" : `text-[16px] ${past ? "text-ink-3" : ""}`}>{d.title}</span>
        {d.sub && <span className={`text-[13px] ${d.today ? "text-ink-3" : "text-muted"}`}>{d.sub}</span>}
      </span>
      {d.done ? (
        <span role="img" aria-label="Done">
          <Icon name="check" size={18} strokeWidth={2.8} />
        </span>
      ) : (
        (d.to || d.sheet) && (
          <span className="text-ink-3">
            <Icon name="chevron" size={16} strokeWidth={2.4} />
          </span>
        )
      )}
    </>
  );
  const cls = `flex items-center gap-3 border-b border-rule text-left ${d.today ? "-mx-3 min-h-16 border-t-2 border-t-red bg-raised px-3" : "min-h-[58px] w-full"}`;
  if (d.to) return <Link to={d.to} className={cls}>{body}</Link>;
  if (d.sheet) {
    return (
      <button type="button" onClick={() => onOpen(d)} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Mock `Plan`, on the phone's copy. */
export function PlanScreen({ m }: { m: PlanModel }) {
  const [open, setOpen] = useState<PlanDay | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const anchor = m.schedule.find((s) => s.date === moving);
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <Poster lines={m.poster} meta={m.meta} />
      <PhaseStrip m={m} />
      <StatGrid label="This week's targets" columns={3} cells={m.targets} />
      <section aria-labelledby="the-week" className="flex flex-col">
        <SectionHead id="the-week">The week</SectionHead>
        {m.days.map((d) => (
          <DayRow key={d.date} d={d} past={d.date < m.date} onOpen={setOpen} />
        ))}
      </section>
      <LinkCard to="/groceries" icon="cart" title="This week's groceries" sub={`${m.groceries.checked} of ${m.groceries.count} checked off`} />
      {open?.sheet && (
        <DaySheet
          sheet={open.sheet}
          onClose={() => setOpen(null)}
          onMove={() => {
            setMoving(open.date);
            setOpen(null);
          }}
        />
      )}
      {anchor && <MoveSheet open onClose={() => setMoving(null)} anchor={anchor} week={m.schedule} today={m.date} />}
    </main>
  );
}

import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "~/components/ui";
import type { ISODate } from "~/domain/types";
import { useMutate } from "~/sync/react";
import type { UsualModel } from "~/today/usuals";
import { btn } from "~/ui/button";
import { JoinedChoice } from "~/ui/JoinedChoice";
import { SectionHead } from "~/ui/SectionHead";
import type { ExerciseRow, ExerciseSection, LibraryModel, MealRow, MealSection } from "./model";

export type LibraryTab = "meals" | "exercises";
type Lead = "first" | "after" | null;

const toggled = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

/**
 * A body part or meal section that opens in place: Anton 24 and a count with a chevron. Open, its head carries the
 * 2 px ink rule as a section head does. `lead` starts a run of folded sections with the 2 px rule above it, as the
 * mocks draw the folded list under an open section.
 */
function Fold({
  label,
  sub,
  count,
  open,
  lead,
  onToggle,
  children,
}: {
  label: string;
  sub?: string;
  count: string;
  open: boolean;
  lead: Lead;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col ${open ? "" : "border-b border-rule"} ${lead ? "border-t-2 border-t-ink" : ""} ${lead === "after" ? "mt-[22px]" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex items-center justify-between gap-3 text-left ${open ? "mb-1 min-h-11 border-b-2 border-ink pb-1.5" : "min-h-14"}`}
      >
        <span className="flex flex-col">
          <span className="font-display text-[24px] uppercase">{label}</span>
          {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
        </span>
        <span className="flex items-center gap-1 font-num text-[15px] font-semibold text-ink-3">
          {count}
          <span className={open ? "rotate-90" : ""}>
            <Icon name="chevron" size={14} strokeWidth={2.4} />
          </span>
        </span>
      </button>
      {open && <ul className="flex flex-col">{children}</ul>}
    </div>
  );
}

/** A folded section that starts the list, or follows an open one, leads its run. After an open one it also leaves room. */
const leads = (open: boolean[], i: number): Lead => (open[i] ? null : i === 0 ? "first" : open[i - 1] ? "after" : null);

function MealLine({ r }: { r: MealRow }) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[16px] font-semibold ${r.resting ? "text-ink-3" : ""}`}>{r.name}</span>
        <span className="text-[13px] text-ink-3">{r.sub}</span>
      </span>
      {r.resting && <span className="flex-none whitespace-nowrap rounded-[4px] border-[1.5px] border-border px-1.5 py-0.5 font-num text-[13px] font-bold text-ink-3">{r.resting}</span>}
    </>
  );
  const cls = "flex min-h-[58px] items-center gap-3 border-b border-rule py-2";
  return <li>{r.to ? <Link to={r.to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

function UsualLine({ u, date }: { u: UsualModel; date: ISODate }) {
  const mutate = useMutate();
  const [logged, setLogged] = useState(false);
  async function log() {
    if (await mutate("logUsual", { clientId: crypto.randomUUID(), usual: u.key, date })) setLogged(true);
  }
  return (
    <li className="flex min-h-[60px] items-center gap-3 border-b border-rule py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold">{u.name}</span>
        <span className="text-[13px] text-ink-3">{u.sub}</span>
      </span>
      <button type="button" disabled={logged} onClick={() => void log()} className={`${btn.outline} h-11 px-4 text-[16px] disabled:border-border disabled:text-ink-3`}>
        {logged ? "Logged" : "Log"}
      </button>
    </li>
  );
}

function OpenMeals({ s }: { s: MealSection }) {
  const [all, setAll] = useState(false);
  const shown = s.limit !== null && !all ? s.rows.slice(0, s.limit) : s.rows;
  return (
    <section aria-labelledby={`meals-${s.id}`} className="flex flex-col">
      <SectionHead id={`meals-${s.id}`} note={String(s.rows.length)}>
        {s.label}
      </SectionHead>
      <ul className="flex flex-col">
        {shown.map((r) => (
          <MealLine key={r.slug} r={r} />
        ))}
      </ul>
      {shown.length < s.rows.length && (
        <button type="button" onClick={() => setAll(true)} className={btn.quiet}>
          Show all {s.rows.length}
        </button>
      )}
    </section>
  );
}

function Meals({ m, date, searching }: { m: LibraryModel; date: ISODate; searching: boolean }) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const folded = m.meals.filter((s) => !s.open);
  return (
    <>
      {m.meals
        .filter((s) => s.open)
        .map((s) => (
          <OpenMeals key={s.id} s={s} />
        ))}
      {(folded.length > 0 || m.usuals.length > 0) && (
        <section aria-label="More meals" className="flex flex-col">
          {folded.map((s, i) => (
            <Fold
              key={s.id}
              label={s.label}
              count={String(s.rows.length)}
              open={opened.has(s.id)}
              lead={leads(folded.map((f) => opened.has(f.id)), i)}
              onToggle={() => setOpened(toggled(opened, s.id))}
            >
              {s.rows.map((r) => (
                <MealLine key={r.slug} r={r} />
              ))}
            </Fold>
          ))}
          {m.usuals.length > 0 && (
            <Fold
              label="Saved off-plan"
              sub="Your usual orders, one tap to log"
              count={String(m.usuals.length)}
              open={searching || opened.has("usuals")}
              lead={leads([...folded.map((f) => opened.has(f.id)), searching || opened.has("usuals")], folded.length)}
              onToggle={() => setOpened(toggled(opened, "usuals"))}
            >
              {m.usuals.map((u) => (
                <UsualLine key={u.key} u={u} date={date} />
              ))}
            </Fold>
          )}
        </section>
      )}
    </>
  );
}

function ExerciseLine({ r }: { r: ExerciseRow }) {
  return (
    <li>
      <Link to={r.to} className="flex min-h-16 items-center gap-3 border-b border-rule py-2">
        <img src={r.image} alt="" loading="lazy" className="size-12 flex-none rounded-[4px] bg-well object-cover" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-semibold">{r.name}</span>
          <span className="text-[13px] text-ink-3">{r.sub}</span>
        </span>
        {r.best && (
          <span className="flex flex-none flex-col items-end">
            <span className="tabular font-num text-[17px] font-bold">{r.best}</span>
            <span className="text-[13px] text-ink-3">best set</span>
          </span>
        )}
      </Link>
    </li>
  );
}

function BodyPart({ s, open, lead, onToggle }: { s: ExerciseSection; open: boolean; lead: Lead; onToggle: () => void }) {
  const [swaps, setSwaps] = useState(false);
  return (
    <Fold label={s.label} count={s.note} open={open} lead={lead} onToggle={onToggle}>
      {s.rows.map((r) => (
        <ExerciseLine key={r.id} r={r} />
      ))}
      {s.swapsLine && !(swaps || s.swapsOpen) && (
        <li>
          <button type="button" aria-expanded={false} onClick={() => setSwaps(true)} className="flex min-h-[52px] w-full items-center border-b border-rule py-2 text-left text-[15px] text-ink-3">
            {s.swapsLine}
          </button>
        </li>
      )}
      {(swaps || s.swapsOpen) && s.swaps.map((r) => <ExerciseLine key={r.id} r={r} />)}
    </Fold>
  );
}

function Exercises({ m, searching }: { m: LibraryModel; searching: boolean }) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set(m.exercises.filter((s) => s.open).map((s) => s.part)));
  const open = m.exercises.map((s) => searching || opened.has(s.part));
  return (
    <section aria-label="Exercises" className="flex flex-col">
      {m.exercises.map((s, i) => (
        <BodyPart key={s.part} s={s} open={open[i]} lead={leads(open, i)} onToggle={() => setOpened(toggled(opened, s.part))} />
      ))}
    </section>
  );
}

/** Mocks `LibraryMeals` and `LibraryExercises`, on the phone's copy. */
export function LibraryScreen({
  m,
  tab,
  onTab,
  query,
  onQuery,
  date,
}: {
  m: LibraryModel;
  tab: LibraryTab;
  onTab: (t: LibraryTab) => void;
  query: string;
  onQuery: (q: string) => void;
  date: ISODate;
}) {
  const searching = query.trim() !== "";
  const nothing = tab === "meals" ? m.meals.length === 0 && m.usuals.length === 0 : m.exercises.length === 0;
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-[22px] px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="font-display text-[64px] uppercase leading-[0.92]">Library.</h1>
      <div className="flex flex-col gap-3">
        <JoinedChoice
          label="Library"
          choices={[
            { value: "meals" as const, label: `Meals · ${m.mealCount}` },
            { value: "exercises" as const, label: `Exercises · ${m.exerciseCount}` },
          ]}
          value={tab}
          onPick={onTab}
          height="h-[46px]"
        />
        <label className="flex h-12 items-center gap-2.5 rounded-[6px] border-[1.5px] border-border bg-field px-3.5">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-ink-3">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <span className="sr-only">{tab === "meals" ? "Search meals" : "Search exercises"}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={tab === "meals" ? "Search meals" : "Search exercises"}
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          />
        </label>
      </div>
      {nothing ? (
        <p className="text-[16px] text-ink-3">Nothing matches "{query.trim()}".</p>
      ) : tab === "meals" ? (
        <Meals m={m} date={date} searching={searching} />
      ) : (
        <Exercises m={m} searching={searching} />
      )}
    </main>
  );
}

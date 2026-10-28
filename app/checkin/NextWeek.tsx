import { COACH_NAME } from "~/brand";
import { Toggle } from "~/components/Toggle";
import { Arrow } from "~/ui/Arrow";
import { ChoicePair } from "~/ui/ChoicePair";
import { LinkCard } from "~/ui/LinkCard";
import type { LiftPlan, NextWeekView } from "./model";

/** Next week (mock CheckInNext, options 3A and 4A): lifts, the meals to rest, and groceries. */
export function NextWeek({ n, onRest, onLift }: { n: NextWeekView; onRest: (slug: string, on: boolean) => void; onLift: (exercise: string, plan: LiftPlan) => void }) {
  return (
    <section aria-labelledby="next-week" className="flex flex-col gap-6">
      <h2 id="next-week" className="border-b-2 border-ink pb-2 font-display text-[44px] uppercase leading-[0.95]">
        Next week.
      </h2>

      <section aria-labelledby="next-lifts" className="flex flex-col gap-3">
        <h3 id="next-lifts" className="text-[18px] font-bold">
          Lifts
        </h3>
        {n.deload ? (
          <p className="text-[16px] leading-[1.45] text-ink-2">Next week is the deload: one set a lift at the same weights.</p>
        ) : (
          <>
            {n.movedUp.length > 0 && (
              <div className="rounded-[6px] border-[1.5px] border-brass-border bg-brass-fill px-3.5 pb-1.5 pt-1">
                <p className="mb-1 mt-2 flex items-center gap-2 font-num text-[16px] font-bold">
                  <span className="rounded-[3px] bg-brass-tag px-[7px] py-[3px] text-[13px] uppercase tracking-[0.06em] text-brass-on">Moved up</span>
                  {n.movedUpNote}
                </p>
                <ul>
                  {n.movedUp.map((m, i) => (
                    <li key={m.name} className={`flex min-h-10 items-center justify-between gap-2.5 ${i < n.movedUp.length - 1 ? "border-b border-brass-rule" : ""}`}>
                      <span className="text-[16px]">{m.name}</span>
                      <span className="tabular whitespace-nowrap font-num text-[18px] font-bold">
                        {m.from} <Arrow /> {m.to} lb
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {n.stuck.map((s) => (
              <div key={s.exercise} className="flex flex-col gap-2.5 rounded-[6px] border-[1.5px] border-ink p-3.5">
                <p className="flex flex-col gap-0.5">
                  <span className="text-[17px] font-bold">{s.title}</span>
                  <span className="text-[15px] leading-[1.4] text-ink-2">{s.line}</span>
                </p>
                <ChoicePair
                  label={`${s.title}: next week's plan`}
                  value={s.plan}
                  onPick={(plan) => onLift(s.exercise, plan)}
                  options={[
                    { value: "hold", title: s.hold, sub: `${COACH_NAME}'s pick` },
                    { value: "drop", title: s.drop },
                  ]}
                />
              </div>
            ))}
            {n.movedUp.length === 0 && n.stuck.length === 0 && <p className="text-[16px] leading-[1.45] text-ink-2">No lift moved up this week. Same weights, beat the reps.</p>}
          </>
        )}
      </section>

      <section aria-labelledby="next-meals" className="flex flex-col">
        <h3 id="next-meals" className="mb-1 text-[18px] font-bold">
          Meals you ate 3 times or more
        </h3>
        {n.repeats.length === 0 ? (
          <p className="text-[16px] leading-[1.45] text-ink-2">No meal came up 3 times this week.</p>
        ) : (
          <ul className="border-t-2 border-ink">
            {n.repeats.map((r) => (
              <li key={r.slug} className="flex min-h-[60px] items-center gap-3 border-b border-rule">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[16px] font-semibold">{r.name}</span>
                  <span className="text-[14px] text-ink-3">{r.sub}</span>
                </span>
                <Toggle on={r.rest} label={`Rest ${r.name}`} onChange={(on) => onRest(r.slug, on)} />
              </li>
            ))}
          </ul>
        )}
        {n.backFromRest.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-ink-3">Back from rest next week:</span>
            {n.backFromRest.map((name) => (
              <span key={name} className="flex h-8 items-center rounded-[6px] border-[1.5px] border-ink px-2.5 text-[14px] font-semibold">
                {name}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2.5 text-[15px] text-ink-3">Swap any meal on Today or its meal screen.</p>
      </section>

      <LinkCard to={n.groceries.href} icon="cart" title={n.groceries.title} sub={n.groceries.sub} />
    </section>
  );
}

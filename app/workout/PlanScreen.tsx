import { useState } from "react";
import { useNavigate } from "react-router";
import { MoveSheet } from "~/components/MoveSheet";
import { Icon } from "~/components/ui";
import { exercises, plan } from "~/content";
import { localMinutes } from "~/domain/dates";
import { WORKOUT_START } from "~/domain/next-up";
import { btn } from "~/ui/button";
import { ChoiceRow } from "~/ui/ChoiceRow";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { AddLiftSheet } from "./AddLiftSheet";
import { addLifts, dropLift, swapToday, undoSwap } from "./lifts";
import type { LiftView, WorkoutModel } from "./model";
import { SwapSheet } from "./SwapSheet";
import { useWorkoutActions } from "./use-actions";

/** Plan (mock WorkoutPlan): pick and shape the day's workout before the clock starts. */
export function PlanScreen({ m, back, dateLabel }: { m: WorkoutModel; back: string; dateLabel: string }) {
  const act = useWorkoutActions(m);
  const navigate = useNavigate();
  const [swapping, setSwapping] = useState<LiftView | null>(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  // From half an hour before noon, Start is the one red action.
  const gymTime = localMinutes(new Date()) >= WORKOUT_START - 30;
  const anchor = m.schedule.find((d) => d.date === m.date);
  const picked = m.templateId !== null;
  const leave = async () => {
    await act.save();
    navigate(back);
  };
  // The screen follows the store: a started workout shows Set, a past day logged late shows Done.
  const begin = () => void (m.live ? act.start() : act.logLate());
  const status = m.live ? (m.key ? "Saved · not started" : "Not started") : dateLabel;
  const meta = `${m.live ? "Noon · " : ""}${m.totals.lifts} lifts · ${m.totals.sets} sets · about ${m.totals.minutes} min`;

  return (
    <GymFrame
      gap="gap-3.5"
      header={
        <>
          <HeaderIcon to={back} label={back === "/" ? "Back to Today" : "Back"} icon="back" />
          <span className="whitespace-nowrap font-num text-[16px] font-bold text-ink-3">{status}</span>
        </>
      }
      dock={
        <Dock>
          <p className="text-[15px] leading-[1.35] text-ink-3">
            {m.live ? "Changes save as you go. The clock starts when you tap Start at the gym." : "Changes save as you go. Log it, then add each lift's sets."}
          </p>
          <div className="flex gap-2.5">
            {!m.live ? (
              <button type="button" disabled={!picked} onClick={begin} className={`${btn.primary} h-[58px] flex-1 disabled:opacity-60`}>
                Log it
              </button>
            ) : gymTime ? (
              <>
                <button type="button" disabled={!picked} onClick={begin} className={`${btn.primary} h-[58px] flex-1 disabled:opacity-60`}>
                  Start now
                </button>
                <button type="button" onClick={() => void leave()} className={`${btn.outline} h-[58px] px-4 text-[17px]`}>
                  Done
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void leave()} className={`${btn.primary} h-[58px] flex-1`}>
                  Done, see you at noon
                </button>
                <button type="button" disabled={!picked} onClick={begin} className={`${btn.outline} h-[58px] px-4 text-[17px] disabled:opacity-60`}>
                  Start now
                </button>
              </>
            )}
          </div>
        </Dock>
      }
    >
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-[0.95]">
          {m.headline.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </h1>
        {picked && <p className="font-num text-[18px] font-semibold text-ink-3">{meta}</p>}
      </section>

      <ChoiceRow label="Workout for today" choices={m.choices.map((c) => ({ value: c.templateId, label: c.label }))} value={m.templateId} onPick={(id) => void act.pick(id)} />

      {m.lifts.length > 0 && (
        <ol aria-label="Lifts" className="flex flex-col">
          {m.lifts.map((l, i) => (
            <LiftRow
              key={l.position}
              l={l}
              first={i === 0}
              setsPerLift={m.setsPerLift}
              onSwap={() => setSwapping(l)}
              onUndo={() => void act.editLifts((list) => undoSwap(list, l.position))}
              onRemove={() => void act.editLifts((list) => dropLift(list, l.position))}
            />
          ))}
        </ol>
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={!picked} onClick={() => setAdding(true)} className={`${btn.outlinePlain} h-11 px-3.5 disabled:opacity-60`}>
          + Add a lift
        </button>
        {m.canMove && anchor && (
          <button type="button" onClick={() => setMoving(true)} className={btn.quiet}>
            Move to another day
          </button>
        )}
      </div>

      <SwapSheet
        key={swapping?.position ?? "none"}
        lift={swapping}
        list={m.lifts}
        canAlways={swapping !== null && swapping.from !== "added" && m.templateId !== null && m.templateId in plan.templates}
        onToday={(id) => {
          setSwapping(null);
          void act.editLifts((list) => swapToday(list, swapping!.position, id));
        }}
        onAlways={(id) => {
          setSwapping(null);
          void act.swapAlways(swapping!, id);
        }}
        onSkip={() => {
          setSwapping(null);
          void act.editLifts((list) => dropLift(list, swapping!.position));
        }}
        onClose={() => setSwapping(null)}
      />
      <AddLiftSheet open={adding} lifts={m.lifts} onAdd={(ids) => void act.editLifts((list) => addLifts(list, ids))} onClose={() => setAdding(false)} />
      {moving && anchor && <MoveSheet open onClose={() => setMoving(false)} anchor={anchor} week={m.schedule} today={m.date} />}
    </GymFrame>
  );
}

function LiftRow({ l, first, setsPerLift, onSwap, onUndo, onRemove }: { l: LiftView; first: boolean; setsPerLift: number; onSwap: () => void; onUndo: () => void; onRemove: () => void }) {
  const changed = l.from !== "plan";
  const up = l.suggestion.goUp && l.suggestion.weight !== null && l.last ? l.suggestion.weight - Math.max(...l.last.sets.map((x) => x.weight)) : null;
  const replaced = l.replaces ? exercises.get(l.replaces)?.name.toLowerCase() : null;
  const link = "h-11 px-2 font-num text-[15px] font-bold text-ink underline underline-offset-[3px]";
  return (
    <li className={`flex min-h-[46px] items-center gap-2.5 ${first ? "border-t-2 border-ink" : "border-t border-rule"} ${changed ? "-mx-2 bg-raised px-2" : ""} last:border-b last:border-b-rule`}>
      <span className="flex flex-1 flex-col py-1">
        <span className="text-[16px] font-semibold">{l.name}</span>
        <span className={`tabular text-[13px] ${changed ? "text-ink-3" : "text-muted"}`}>
          {setsPerLift} × {l.repMin} to {l.repMax}
          {l.from === "swap" && <span className="font-bold"> · swapped for {replaced}, today only</span>}
          {l.from === "added" && <span className="font-bold"> · added today</span>}
          {up !== null && (
            <span className="font-bold text-brass-tag">
              {" "}
              · {l.suggestion.weight} lb, up {up}
            </span>
          )}
        </span>
      </span>
      {l.from === "swap" ? (
        <button type="button" onClick={onUndo} aria-label={`Undo swap, back to ${replaced}`} className={link}>
          Undo
        </button>
      ) : l.from === "added" ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${l.name.toLowerCase()}`} className={link}>
          Remove
        </button>
      ) : (
        <button type="button" onClick={onSwap} aria-label={`Swap ${l.name.toLowerCase()}`} className="flex size-11 items-center justify-center text-ink-3">
          <Icon name="swap" size={18} />
        </button>
      )}
    </li>
  );
}

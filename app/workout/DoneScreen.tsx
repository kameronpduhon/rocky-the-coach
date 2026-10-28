import { useState } from "react";
import { Link } from "react-router";
import { COACH_NAME } from "~/brand";
import type { Feel } from "~/domain/progression";
import { Arrow } from "~/ui/Arrow";
import { btn } from "~/ui/button";
import { ChoiceRow } from "~/ui/ChoiceRow";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { count, setsText, type WorkoutModel } from "./model";
import { SetsSheet } from "./SetsSheet";
import { useWorkoutActions } from "./use-actions";

const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "right", label: "About right" },
  { value: "hard", label: "Hard" },
];

/** Done (mock WorkoutDone). Tapping a lift fixes its sets, or adds them on a day logged after the fact. */
export function DoneScreen({ m, back, dateLabel }: { m: WorkoutModel; back: string; dateLabel: string }) {
  const act = useWorkoutActions(m);
  const [fixing, setFixing] = useState<number | null>(null);
  const fixLift = m.lifts.find((l) => l.position === fixing) ?? null;
  const backLabel = back === "/" ? "Back to Today" : "Back";
  const ups = m.movedUp.length;

  return (
    <GymFrame
      gap="gap-3.5"
      header={
        m.live ? undefined : (
          <>
            <HeaderIcon to={back} label={backLabel} icon="back" />
            <span className="font-num text-[16px] font-bold text-ink-3">{dateLabel}</span>
          </>
        )
      }
      dock={
        <Dock>
          <Link to={back} className={`${btn.gym} h-[60px]`}>
            {backLabel}
          </Link>
        </Dock>
      }
    >
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[60px] uppercase leading-[0.92]">
          {[...m.headline, "Done."].map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">
          {count(m.totals.lifts, "lift")} · {count(m.totals.sets, "set")}{m.totals.minutes > 0 ? ` · ${m.totals.minutes} min` : ""}
        </p>
        <p className="mt-1 text-[17px] font-medium leading-[1.4]">
          <span className="font-num font-bold">{COACH_NAME}:</span> {m.rockyLine}
        </p>
      </section>

      {ups > 0 && (
        <section aria-labelledby="moved-up" className="flex flex-col rounded-[6px] border-[1.5px] border-brass-border bg-brass-fill px-3.5 pb-1.5 pt-1">
          <h2 id="moved-up" className="mb-1 mt-2 flex items-center gap-2 font-num text-[16px] font-bold">
            <span className="rounded-[3px] bg-brass-tag px-[7px] py-[3px] text-[13px] tracking-[0.06em] text-brass-on">MOVED UP</span>
            {ups} lift{ups === 1 ? " goes" : "s go"} up next week
          </h2>
          {m.movedUp.map((x, i) => (
            <div key={x.name} className={`flex min-h-10 items-baseline justify-between gap-3 pt-2 ${i < ups - 1 ? "border-b border-brass-border" : ""}`}>
              <span className="text-[16px]">{x.name}</span>
              <span className="tabular font-num text-[18px] font-bold">
                {x.from} <Arrow /> {x.to} lb
              </span>
            </div>
          ))}
        </section>
      )}

      <ul aria-label="Every lift" className="flex flex-col text-[15px]">
        {m.lifts.map((l, i) => {
          const up = m.movedUp.some((x) => x.name === l.name);
          return (
            <li key={l.position} className={`${i === 0 ? "border-t-2 border-ink" : "border-t border-rule"} last:border-b last:border-b-rule`}>
              <button type="button" onClick={() => setFixing(l.position)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                <span>{l.name}</span>
                {l.checked ? (
                  <span className="font-num font-bold">Done, no numbers</span>
                ) : l.sets.length > 0 ? (
                  <span className="tabular font-num font-bold">
                    {setsText(l.sets)}
                    {up ? "" : " · holds"}
                  </span>
                ) : (
                  <span className="text-muted">{m.live ? "Not done" : "Add sets"}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-label="How it felt" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[16px] font-semibold">How did it feel?</span>
          <span className="text-[14px] text-muted">optional</span>
        </div>
        <ChoiceRow label="How it felt" layout="grid" choices={FEELS} value={m.feel} onPick={(f) => void act.rate(f === m.feel ? null : f)} />
      </section>

      <SetsSheet
        key={fixing ?? "none"}
        lift={fixLift}
        setsPerLift={m.setsPerLift}
        canAdd
        onEdit={(key, w, r) => void act.editSet(key, w, r)}
        onDelete={(key) => void act.deleteSet(key)}
        onAdd={(n, w, r) => fixLift && void act.logSet(fixLift, n, w, r)}
        onClose={() => setFixing(null)}
      />
    </GymFrame>
  );
}

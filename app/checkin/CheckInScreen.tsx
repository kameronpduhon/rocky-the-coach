import { Link } from "react-router";
import { COACH_NAME } from "~/brand";
import { btn } from "~/ui/button";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { RockyCard } from "~/ui/RockyCard";
import { SectionHead } from "~/ui/SectionHead";
import { StatGrid } from "~/ui/StatGrid";
import { TapGrid } from "~/ui/TapGrid";
import { TrendChart } from "~/ui/TrendChart";
import { CallBlock } from "./CallBlock";
import type { Level, SleepLevel } from "./digest";
import type { CheckInModel, PageChoices } from "./model";
import { NextWeek } from "./NextWeek";
import { WaistField } from "./WaistField";

const LEVELS = [
  { value: "low", label: "Low" },
  { value: "fine", label: "Fine" },
  { value: "high", label: "High" },
];
const SLEEP = [
  { value: "poor", label: "Poor" },
  { value: "fine", label: "Fine" },
  { value: "great", label: "Great" },
];

/** The one-page Sunday check-in (option 1A): the week, the call, next week, with the dock always showing. */
export function CheckInScreen({
  m,
  onChoose,
  onWaist,
  onFinish,
  onReopen,
}: {
  m: CheckInModel;
  onChoose: (change: Partial<PageChoices>) => void;
  onWaist: (inches: number) => void;
  onFinish: () => void;
  onReopen: () => void;
}) {
  const dock = (
    <Dock>
      <p className="text-center text-[15px] text-ink-3">{m.dock.note}</p>
      {m.dock.action === "finish" && (
        <button type="button" onClick={onFinish} className={`${btn.primary} h-[60px] text-[20px]`}>
          Finish check-in
        </button>
      )}
      {m.dock.action === "today" && (
        <Link to="/" className={`${btn.primary} h-[60px] text-[20px]`}>
          Back to Today
        </Link>
      )}
      {m.dock.change && (
        <button type="button" onClick={onReopen} className={`${btn.quiet} self-center`}>
          Change my answers
        </button>
      )}
    </Dock>
  );

  return (
    <GymFrame
      gap="gap-6"
      header={
        <>
          <HeaderIcon to="/" label="Back to Today" icon="back" />
          <span className="whitespace-nowrap font-num text-[16px] font-bold tracking-[0.02em]">{m.header}</span>
        </>
      }
      dock={dock}
    >
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[64px] uppercase leading-[0.92]">
          {m.poster.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{m.meta}</p>
      </section>

      <section aria-label="Weight trend" className="flex flex-col gap-1.5">
        <TrendChart points={m.chart.points} label={m.chart.label} marker={m.chart.marker} />
        <p className="tabular flex justify-between gap-2 font-num text-[14px] font-semibold text-ink-3">
          <span>{m.chart.left}</span>
          <span>This week</span>
          <span className="font-bold text-ink">{m.chart.right}</span>
        </p>
      </section>

      <StatGrid
        label="The week in numbers"
        columns={2}
        cells={[
          { label: "Days that counted", ...m.stats.days },
          { label: "Lifts", ...m.stats.lifts },
          { label: "Steps, daily average", ...m.stats.steps },
          { label: "Waist, inches", labelFor: "waist", value: <WaistField id="waist" value={m.waist.value} note={m.waist.note} editable={m.waist.editable} onCommit={onWaist} /> },
        ]}
      />

      {m.take && (
        <RockyCard
          label={`${COACH_NAME}'s take`}
          rows={[
            { label: "Win", text: m.take.win },
            { label: "Fix", text: m.take.fix },
            { label: "Call", text: m.take.call },
          ]}
        />
      )}

      {m.call && (
        // Disabled once finished: every choice below shows as saved until "Change my answers".
        <fieldset disabled={m.readOnly} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
          <section aria-labelledby="feel" className="flex flex-col gap-2.5">
            <SectionHead id="feel">How did it feel?</SectionHead>
            <TapGrid
              rows={[
                { label: "Hunger", choices: LEVELS, value: m.choices.hunger, onPick: (v) => onChoose({ hunger: v as Level | null }) },
                { label: "Energy", choices: LEVELS, value: m.choices.energy, onPick: (v) => onChoose({ energy: v as Level | null }) },
                { label: "Sleep", choices: SLEEP, value: m.choices.sleep, onPick: (v) => onChoose({ sleep: v as SleepLevel | null }) },
              ]}
            />
            <p className="text-[14px] text-ink-3">Two hungry weeks in a row and {COACH_NAME} picks extra steps over cutting food.</p>
          </section>

          <CallBlock view={m.call.view} choice={m.call.choice} onChoice={(pick) => onChoose({ pick })} changes={m.call.changes} />

          {m.next && (
            <NextWeek
              n={m.next}
              onRest={(slug, on) => onChoose({ rest: on ? [...(m.choices.rest ?? []), slug] : (m.choices.rest ?? []).filter((s) => s !== slug) })}
              onLift={(exercise, plan) => onChoose({ lifts: { ...m.choices.lifts, [exercise]: plan } })}
            />
          )}
        </fieldset>
      )}
    </GymFrame>
  );
}

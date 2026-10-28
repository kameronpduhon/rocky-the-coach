import { useState } from "react";
import { Link } from "react-router";
import { Arrow } from "~/ui/Arrow";
import { btn } from "~/ui/button";
import { JoinedChoice } from "~/ui/JoinedChoice";
import { Poster } from "~/ui/Poster";
import { SectionHead } from "~/ui/SectionHead";
import { StatGrid } from "~/ui/StatGrid";
import { TrendChart } from "~/ui/TrendChart";
import type { ProgressModel, Range } from "./model";
import { WeighInsSheet } from "./WeighInsSheet";

const RANGES: { value: Range; label: string }[] = [
  { value: "4w", label: "4W" },
  { value: "phase", label: "PHASE" },
  { value: "all", label: "ALL" },
];

/** Mock `Progress`, on the phone's copy. */
export function ProgressScreen({ m, range, onRange }: { m: ProgressModel; range: Range; onRange: (r: Range) => void }) {
  const [fixing, setFixing] = useState(false);
  const { labels } = m.chart;
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <Poster lines={m.poster} meta={m.meta} />

      <section aria-labelledby="weight" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="weight" className="font-display text-[28px] uppercase">
            Weight
          </h2>
          <div className="w-[200px]">
            <JoinedChoice label="Range" choices={RANGES} value={range} onPick={onRange} height="h-11" />
          </div>
        </div>
        <TrendChart
          points={m.chart.points}
          tall
          goal={m.chart.goal}
          projection={m.chart.projection}
          label={`Weight. ${labels.start}. ${labels.today}.${labels.end ? ` Goal ${labels.end}.` : ""}`}
        />
        <div className="flex justify-between gap-2 font-num text-[14px] font-semibold text-ink-3">
          <span>{labels.start}</span>
          <span className="font-bold text-ink">{labels.today}</span>
          {labels.end && <span>{labels.end}</span>}
        </div>
        <p className="text-[15px] leading-[1.45] text-ink-2">{m.note}</p>
        {m.weighIns.length > 0 && (
          <button type="button" onClick={() => setFixing(true)} className={btn.quiet}>
            Fix a weigh-in
          </button>
        )}
      </section>

      <StatGrid label="Body" columns={2} cells={m.body} />

      <section aria-labelledby="stronger" className="flex flex-col">
        {m.stronger.length > 0 && (
          <>
            <SectionHead id="stronger">Stronger</SectionHead>
            <ul className="flex flex-col">
              {m.stronger.map((s) => (
                <li key={s.id} className="flex min-h-[54px] items-center gap-3 border-b border-rule">
                  <span className="flex-1 text-[16px] font-semibold">{s.name}</span>
                  <span className="tabular whitespace-nowrap font-num text-[18px] font-bold text-ink-3">
                    <span className="sr-only">from </span>
                    {s.from} <Arrow />
                  </span>
                  <span className="tabular w-16 text-right font-num text-[22px] font-bold">{s.to}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link to="/progress/lifts" className={btn.quiet}>
          {m.liftsLink}
        </Link>
      </section>

      <section aria-labelledby="showing-up" className="flex flex-col gap-3">
        <SectionHead id="showing-up">Showing up</SectionHead>
        <StatGrid label="Showing up" columns={3} cells={m.showingUp} ruled={false} />
        <p className="text-[15px] leading-[1.45] text-ink-2">{m.streakLine}</p>
      </section>

      {fixing && <WeighInsSheet weighIns={m.weighIns} onClose={() => setFixing(false)} />}
    </main>
  );
}

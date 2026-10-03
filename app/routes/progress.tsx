import { env } from "cloudflare:workers";
import type { Route } from "./+types/progress";
import { WeightChart } from "~/components/WeightChart";
import { Card, Icon, LargeTitle, Screen, SectionTitle, Tile } from "~/components/ui";
import { getDb } from "~/db/client";
import { localDate } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { progressData } from "~/server/progress.server";

export function meta() {
  return [{ title: "Progress · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { p: await progressData(getDb(env.DB), localDate(serverNow())) };
}

const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export default function Progress({ loaderData }: Route.ComponentProps) {
  const { p } = loaderData;
  return (
    <Screen>
      <LargeTitle eyebrow={`Since ${fmt(p.phaseStart, { month: "short", day: "numeric" })}`} title="Progress" />

      <Card className="flex flex-col gap-2.5 p-[18px]" aria-label="Weight trend">
        <h2 className="text-[13px] font-semibold">Weight · 7-day average</h2>
        <div className="flex items-baseline gap-2.5">
          <div className="tabular text-[40px] font-bold leading-tight">
            {p.latestAvg ?? "--"}
            <span className="ml-1 text-[18px] font-semibold text-label-2">lb</span>
          </div>
          {p.changeSinceStart !== null && (
            <div className={`tabular text-[16px] font-semibold ${p.changeSinceStart <= 0 ? "text-steps-text" : "text-label-2"}`}>{signed(p.changeSinceStart)} lb</div>
          )}
        </div>
        {p.latestAvg === null && <p className="text-[14px] text-label-2">Not enough weigh-ins. The average needs 3 in a week.</p>}
        <WeightChart series={p.series} />
        <div className="flex gap-[18px] text-[13px] text-label-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-protein" />
            7-day average
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--chart-dot)]" />
            Daily weigh-in
          </span>
        </div>
        <p className="text-[14px] leading-[1.45] text-label-2">Daily numbers bounce with water and salt. The blue line is the one that counts.</p>
      </Card>

      <section aria-label="Body and adherence" className="grid grid-cols-2 gap-2.5">
        <Tile label="Waist" value={p.waist ? `${p.waist.latest} in` : "--"} sub={p.waist?.change != null ? `${signed(p.waist.change)} in` : "Measure at check-in"} subGood={(p.waist?.change ?? 0) < 0} />
        <Tile label="Days on plan" value={`${p.daysOnPlan} of ${p.daysTracked}`} sub={`${p.streak} day streak`} />
        <Tile label="Workouts" value={`${p.workoutsDone} of ${p.workoutsPlanned}`} sub={p.optionalDone ? `+${p.optionalDone} optional` : "Mon, Wed, Fri"} />
        <Tile label="Avg steps" value={p.avgSteps.toLocaleString()} sub={`goal ${p.stepGoal.toLocaleString()}`} valueGood={p.avgSteps >= p.stepGoal} />
      </section>

      {p.strength.length > 0 && (
        <section aria-label="Getting stronger" className="flex flex-col gap-2">
          <SectionTitle>Getting stronger</SectionTitle>
          <Card className="overflow-hidden">
            {p.strength.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                <img src={s.image} alt="" className="size-12 flex-none rounded-xl bg-fill object-cover" />
                <div className="min-w-0 flex-1 text-[16px] font-medium">{s.name}</div>
                <div className="tabular flex-none text-[16px] font-semibold">
                  <span className="font-medium text-label-3">
                    <span className="sr-only">from </span>
                    {s.from} <span aria-hidden="true">→</span>
                    <span className="sr-only"> to</span>
                  </span>{" "}
                  {s.to} lb
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <Card className="flex items-center justify-between px-[18px] py-4" aria-label="Progress photos">
        <div>
          <h2 className="text-[16px] font-semibold">Progress photos</h2>
          <div className="mt-px text-[14px] text-label-2">Next round: {fmt(p.nextPhoto, { weekday: "long", month: "short", day: "numeric" })}</div>
        </div>
        <span className="text-label-2">
          <Icon name="camera" size={22} strokeWidth={1.8} />
        </span>
      </Card>
    </Screen>
  );
}

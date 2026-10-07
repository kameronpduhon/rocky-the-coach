import { env } from "cloudflare:workers";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/progress";
import { WeighInSheet } from "~/components/WeighInSheet";
import { WeightChart } from "~/components/WeightChart";
import { Card, Icon, LargeTitle, Screen, SectionTitle, Tile } from "~/components/ui";
import { getDb } from "~/db/client";
import { isISODate, localDate } from "~/domain/dates";
import { deleteWeighIn, setWeighIn } from "~/server/body.server";
import { serverNow } from "~/server/clock.server";
import { progressData } from "~/server/progress.server";

export function meta() {
  return [{ title: "Progress · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { p: await progressData(getDb(env.DB), localDate(serverNow())) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = getDb(env.DB);
  const now = serverNow();
  const date = form.get("date");
  if (!isISODate(date) || date > localDate(now)) return { error: "Pick a day that has happened." };
  switch (form.get("intent")) {
    case "weigh-in": {
      const weight = Number(form.get("weight"));
      if (!Number.isFinite(weight) || weight < 80 || weight > 500) return { error: "Enter your weight in pounds." };
      await setWeighIn(db, date, Math.round(weight * 10) / 10, now);
      return { ok: true };
    }
    case "delete-weigh-in":
      await deleteWeighIn(db, date);
      return { ok: true };
    default:
      return { error: "Unknown action" };
  }
}

const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export default function Progress({ loaderData }: Route.ComponentProps) {
  const { p } = loaderData;
  const [editing, setEditing] = useState<{ date: string; weight: number } | null>(null);
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

      {p.recentWeighIns.length > 0 && (
        <section aria-label="Recent weigh-ins" className="flex flex-col gap-2">
          <SectionTitle right="Tap to fix">Weigh-ins</SectionTitle>
          <Card className="overflow-hidden">
            {p.recentWeighIns.map((w) => (
              <button
                key={w.date}
                type="button"
                onClick={() => setEditing(w)}
                className="tabular flex min-h-[52px] w-full items-center justify-between gap-3 border-b-[0.5px] border-separator px-[18px] py-3 text-left text-[16px] last:border-b-0"
              >
                <span>{fmt(w.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {w.weight} lb
                  <span aria-hidden="true" className="text-label-4">
                    <Icon name="chevron" size={16} strokeWidth={2.4} />
                  </span>
                </span>
              </button>
            ))}
          </Card>
        </section>
      )}

      {p.recentWorkouts.length > 0 && (
        <section aria-label="Recent workouts" className="flex flex-col gap-2">
          <SectionTitle right="Tap to fix">Workouts</SectionTitle>
          <Card className="overflow-hidden">
            {p.recentWorkouts.map((w) => (
              <Link
                key={`${w.date}-${w.templateId}`}
                to={`/workout?date=${w.date}&template=${w.templateId}&from=progress`}
                className="flex min-h-[60px] items-center gap-3 border-b-[0.5px] border-separator px-[18px] py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold">{w.name}</div>
                  <div className="tabular mt-px text-[14px] text-label-2">
                    {fmt(w.date, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                    {w.sets > 0 ? `${w.sets} set${w.sets === 1 ? "" : "s"}` : w.checks > 0 ? `${w.checks} exercise${w.checks === 1 ? "" : "s"}, no numbers` : "Done, no numbers"}
                  </div>
                </div>
                <span className="flex-none text-label-4">
                  <Icon name="chevron" size={18} strokeWidth={2.4} />
                </span>
              </Link>
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

      <WeighInSheet entry={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

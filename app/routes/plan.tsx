import { env } from "cloudflare:workers";
import { useState } from "react";
import { Link } from "react-router";
import { MoveSheet } from "~/components/MoveSheet";
import type { Route } from "./+types/plan";
import { Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { plan } from "~/content";
import { getDb } from "~/db/client";
import { dayMode, optionalTemplateFor, templateFor, weekNumber, weekType } from "~/domain/calendar";
import { addDays, isISODate, localDate, weekStart, weekday } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { groceryList } from "~/server/groceries.server";
import { datesWithSets } from "~/server/history.server";
import { moveWorkout, movesBetween, weekSchedule } from "~/server/schedule.server";
import { targetsFor } from "~/server/targets.server";
import { resolveTemplate } from "~/server/workouts.server";

export function meta() {
  return [{ title: "Plan · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const today = localDate(serverNow());
  const monday = weekStart(today);
  const [week, targets, groceries] = await Promise.all([
    Promise.all([movesBetween(db, monday, addDays(monday, 6)), datesWithSets(db, monday, today)]).then(([moves, setDates]) => weekSchedule(monday, moves, setDates)),
    targetsFor(db, today),
    groceryList(db, monday, today, { rest: null, swaps: [] }),
  ]);
  const days = await Promise.all(
    week.map(async (d) => {
      const optionalId = d.templateId ? null : optionalTemplateFor(plan, d.date);
      const shown = d.templateId ?? optionalId;
      return {
        ...d,
        today: d.date === today,
        past: d.date < today,
        moved: d.templateId !== templateFor(plan, d.date),
        optionalId,
        optional: optionalId ? plan.templates[optionalId]!.name : null,
        mode: dayMode(d.date),
        exercises: shown ? (await resolveTemplate(db, shown, d.date)).map((s) => ({ name: s.exercise.name, reps: `${s.repMin} to ${s.repMax}` })) : [],
      };
    }),
  );
  const current = weekNumber(plan, today);
  const lastWeek = Math.max(...Object.keys(plan.weekTypes).map(Number), 13);
  return {
    current,
    lastWeek,
    phaseStart: plan.phaseStart,
    weeks: Array.from({ length: lastWeek }, (_, i) => ({ n: i + 1, type: weekType(plan, addDays(plan.phaseStart, i * 7)) })),
    targets,
    days,
    week,
    today,
    monday,
    groceryCount: groceries.count,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (form.get("intent") !== "move") return { error: "Unknown action" };
  const a = form.get("a");
  const b = form.get("b");
  if (!isISODate(a) || !isISODate(b)) return { error: "Pick a day this week." };
  const error = await moveWorkout(getDb(env.DB), a, b);
  return error ? { error } : { ok: true };
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function weekRange(monday: string) {
  const sunday = addDays(monday, 6);
  return `${short(monday)} to ${monday.slice(5, 7) === sunday.slice(5, 7) ? Number(sunday.slice(8)) : short(sunday)}`;
}

function weekFill(n: number, current: number, type: string) {
  if (n === current) return "var(--label)";
  if (n < current) return "var(--timeline-past)";
  if (type === "deload") return "color-mix(in srgb, var(--protein) 35%, transparent)";
  if (type === "maintenance") return "color-mix(in srgb, var(--steps) 35%, transparent)";
  return "var(--fill)";
}

export default function Plan({ loaderData }: Route.ComponentProps) {
  const { current, lastWeek, phaseStart, weeks, targets, days, week, today, monday, groceryCount } = loaderData;
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const movingDay = week.find((d) => d.date === moving);
  const left = Math.max(0, lastWeek - current);
  const deload = weeks.find((w) => w.type === "deload")?.n;
  const maintenance = weeks.find((w) => w.type === "maintenance")?.n;
  const checkpoint = weeks.find((w) => w.type === "checkpoint")?.n;

  return (
    <Screen>
      <LargeTitle eyebrow={`Phase 1 · ${short(phaseStart)} to Jan 1`} title="Plan" />

      <Card className="flex flex-col gap-3.5 p-[18px]" aria-label="Phase timeline">
        <div className="flex items-baseline justify-between gap-3 leading-[normal]">
          <h2 className="text-[17px] font-semibold">{current >= 1 ? `Week ${Math.min(current, lastWeek)} of ${lastWeek}` : `Starts ${short(phaseStart)}`}</h2>
          <span className="tabular text-[14px] text-label-2">{current < 1 ? "" : left > 0 ? `${left} week${left === 1 ? "" : "s"} to Jan 1` : "Checkpoint week"}</span>
        </div>
        <ol className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((w) => (
            <li
              key={w.n}
              aria-label={`Week ${w.n}${w.type !== "standard" ? `, ${w.type}` : ""}${w.n === current ? ", this week" : w.n < current ? ", done" : ""}`}
              aria-current={w.n === current ? "step" : undefined}
              className="h-[30px] rounded-md"
              style={{ background: weekFill(w.n, current, w.type), boxShadow: w.type === "checkpoint" && w.n !== current ? "inset 0 0 0 1.5px var(--label)" : undefined }}
            />
          ))}
        </ol>
        <ul className="flex flex-col gap-2 text-[14px] leading-[normal] text-label-2">
          {deload && (
            <li className="flex items-center gap-2.5">
              <span aria-hidden="true" className="size-3 flex-none rounded" style={{ background: "color-mix(in srgb, var(--protein) 60%, transparent)" }} />
              Week {deload} · Deload, Thanksgiving Nov 26
            </li>
          )}
          {maintenance && (
            <li className="flex items-center gap-2.5">
              <span aria-hidden="true" className="size-3 flex-none rounded" style={{ background: "color-mix(in srgb, var(--steps) 60%, transparent)" }} />
              Week {maintenance} · Maintenance, Christmas Dec 25
            </li>
          )}
          {checkpoint && (
            <li className="flex items-center gap-2.5">
              <span aria-hidden="true" className="size-3 flex-none rounded shadow-[inset_0_0_0_1.5px_var(--label)]" />
              Week {checkpoint} · Jan 1 checkpoint
            </li>
          )}
        </ul>
      </Card>

      <section aria-label="Daily targets this week" className="grid grid-cols-3 gap-2.5">
        <Target label="Calories" value={targets.kcal.toLocaleString()} color="text-calories" />
        <Target label="Protein" value={`${targets.proteinG} g`} color="text-protein" />
        <Target label="Steps" value={targets.stepGoal.toLocaleString()} color="text-steps-text" />
      </section>

      <section aria-label="This week" className="flex flex-col gap-2">
        <SectionTitle right={weekRange(monday)}>This week</SectionTitle>
        <Card className="overflow-hidden">
          {days.map((d) => {
            const dow = weekday(d.date);
            const isSunday = dow === 0;
            const expanded = open === d.date;
            const workoutId = d.templateId ?? (d.past ? d.optionalId : null);
            const sub = d.name
              ? [d.moved && "Moved", d.logged ? "Logged" : d.today && "Today", `${d.exercises.length} exercises`, !d.logged && !d.today && "~45 min"].filter(Boolean).join(" · ")
              : d.optional
                ? `${d.optional}, 30 min`
                : isSunday
                  ? `Weekend mode · ${d.today ? "check-in tonight" : "check-in at 5pm"}`
                  : d.mode === "weekend"
                    ? "Weekend mode · meat-first whole foods"
                    : d.moved
                      ? "Workout moved"
                      : "";
            const body = (
              <>
                <div
                  className={`flex size-11 flex-none flex-col items-center justify-center rounded-full leading-none ${d.today ? "bg-label text-bg" : "bg-fill"}`}
                  aria-hidden="true"
                >
                  <span className={`text-[10px] font-bold ${d.today ? "" : "text-label-on-fill"}`}>{DOW[dow]}</span>
                  <span className="tabular text-[17px] font-bold">{Number(d.date.slice(8))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="sr-only">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}: </span>
                  <div className={`text-[16px] font-semibold ${d.name ? "" : "text-label-2"}`}>{d.name ?? (d.optional ? "Rest or optional" : "Rest")}</div>
                  {sub && <div className={`mt-px text-[14px] ${d.name ? "text-label-2" : "text-label-3"}`}>{sub}</div>}
                </div>
                {isSunday && (
                  <span className="flex-none text-label-4">
                    <Icon name="chevron" size={18} strokeWidth={2.4} />
                  </span>
                )}
              </>
            );
            const cls = "flex min-h-[68px] w-full items-center gap-3.5 px-4 py-3 text-left leading-[normal]";
            return (
              <div key={d.date} className="border-b-[0.5px] border-separator last:border-b-0">
                {isSunday ? (
                  <Link to="/check-in" className={cls}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={() => setOpen(open === d.date ? null : d.date)} className={cls} aria-expanded={expanded}>
                    {body}
                  </button>
                )}
                {expanded && (
                  <div className="flex flex-col pb-3 pl-[74px] pr-4">
                    {d.exercises.length > 0 && (
                      <ol className="flex flex-col">
                        {d.exercises.map((e) => (
                          <li key={e.name} className="flex items-baseline justify-between gap-3 border-t-[0.5px] border-separator py-2.5 text-[15px]">
                            <span>{e.name}</span>
                            <span className="tabular flex-none text-[14px] text-label-2">{e.reps}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="flex flex-wrap gap-2 border-t-[0.5px] border-separator pt-3">
                      {workoutId && !d.today && d.past && (
                        <Link
                          to={`/workout?date=${d.date}&template=${workoutId}&from=plan`}
                          className="btn-prominent flex h-11 items-center rounded-full px-4 text-[15px] font-semibold"
                        >
                          {d.logged ? "View or fix sets" : d.templateId ? "Log workout" : `Log ${d.optional}`}
                        </Link>
                      )}
                      {d.templateId && d.today && (
                        <Link to="/workout" className="btn-prominent flex h-11 items-center rounded-full px-4 text-[15px] font-semibold">
                          {d.logged ? "Open workout" : "Start workout"}
                        </Link>
                      )}
                      {!d.logged && (
                        <button type="button" onClick={() => setMoving(d.date)} className="btn-secondary flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold">
                          <Icon name="swap" size={16} />
                          {d.templateId ? "Move to another day" : "Train this day"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      {movingDay && <MoveSheet open onClose={() => setMoving(null)} anchor={movingDay} week={week} today={today} />}

      <Link to="/groceries" className="flex min-h-[60px] items-center justify-between gap-3 rounded-[26px] bg-card px-[18px] py-4">
        <span>
          <span className="block text-[16px] font-semibold">Grocery list</span>
          <span className="tabular mt-px block text-[14px] text-label-2">{groceryCount} items for this week's meals</span>
        </span>
        <span className="flex-none text-label-4">
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </span>
      </Link>
    </Screen>
  );
}

function Target({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[20px] bg-card p-3.5 leading-[normal]">
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`tabular mt-0.5 text-[22px] font-bold ${color}`}>{value}</div>
    </div>
  );
}

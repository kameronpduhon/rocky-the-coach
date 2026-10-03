import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import type { Route } from "./+types/today";
import { MealRow } from "~/components/MealRow";
import { Rings } from "~/components/Rings";
import { Sheet } from "~/components/Sheet";
import { Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { messages } from "~/content";
import { getDb } from "~/db/client";
import { localDate, mealDate } from "~/domain/dates";
import { pickSituation, renderMessage } from "~/domain/messages";
import { logWeighIn } from "~/server/body.server";
import { loadDay } from "~/server/day.server";
import { logOffPlan, type OffPlanCategory } from "~/server/meals.server";
import { serverNow } from "~/server/clock.server";

export function meta() {
  return [{ title: "Today · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  const now = serverNow();
  const db = getDb(env.DB);
  const day = await loadDay(db, mealDate(now), now);
  const lunch = day.slots.find((s) => s.slot === "lunch")?.meal.name ?? "lunch";
  const next = day.slots.find((s) => s.slot === day.nextSlot)?.meal.name ?? "breakfast tomorrow";
  const situation = pickSituation({
    minutes: day.minutes,
    relaxedDay: day.relaxed,
    trainingDay: day.training !== null,
    sessionStarted: day.sessionStarted,
    loggedSetToday: day.loggedSetToday,
    missedTwice: day.missedTwice,
    weighedIn: day.weighIn !== null,
    proteinG: day.totals.proteinG,
    proteinTarget: day.targets.proteinG,
    steps: day.steps,
    stepGoal: day.targets.stepGoal,
    onPlan: day.onPlan,
  });
  const message = renderMessage(messages, situation, day.date, {
    protein: day.totals.proteinG,
    lunch: lunch.toLowerCase(),
    workout: day.training?.name ?? "",
    left: situation === "steps-behind" ? (day.targets.stepGoal - day.steps).toLocaleString() : Math.max(0, day.targets.proteinG - day.totals.proteinG),
    streak: day.streak,
    nextMeal: next.toLowerCase(),
  });
  return { day, message };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = getDb(env.DB);
  const now = serverNow();
  switch (form.get("intent")) {
    case "weigh-in": {
      const weight = Number(form.get("weight"));
      if (!Number.isFinite(weight) || weight < 80 || weight > 500) return { error: "Enter your weight in pounds." };
      await logWeighIn(db, localDate(now), Math.round(weight * 10) / 10, now);
      return { ok: true };
    }
    case "off-plan": {
      const name = String(form.get("name") ?? "").trim();
      const kcal = Number(form.get("kcal"));
      const protein = Number(form.get("protein") ?? 0);
      const category = String(form.get("category")) as OffPlanCategory;
      if (!name || !Number.isFinite(kcal) || kcal < 0 || !["meal", "snack", "dessert", "drink"].includes(category)) {
        return { error: "Add a name, a category, and calories." };
      }
      await logOffPlan(db, mealDate(now), { name, category, kcal: Math.round(kcal), proteinG: Math.round(protein || 0), relaxed: form.get("relaxed") === "on" }, now);
      return { ok: true };
    }
    default:
      return { error: "Unknown action" };
  }
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default function Today({ loaderData }: Route.ComponentProps) {
  const { day, message } = loaderData;
  const [offPlanOpen, setOffPlanOpen] = useState(false);
  const pct = (a: number, b: number) => (b > 0 ? a / b : 0);
  const dateLabel = DATE_FMT.format(new Date(`${day.date}T12:00:00Z`));

  return (
    <Screen>
      <LargeTitle
        eyebrow={`${dateLabel} · Week ${day.weekNumber}`}
        title="Today"
        right={
          <div className="flex items-center gap-2">
            <span className="glass flex h-9 items-center rounded-full px-3.5 text-[14px] font-semibold">{day.streak} day streak</span>
            <Link to="/settings" aria-label="Settings" className="glass flex size-11 items-center justify-center rounded-full">
              <Icon name="gear" />
            </Link>
          </div>
        }
      />

      {day.weighIn === null && <WeighInCard />}
      {day.checkInDue && (
        <Link to="/check-in" className="flex min-h-[60px] items-center justify-between gap-3 rounded-[26px] bg-card px-[18px] py-4">
          <span>
            <span className="block text-[17px] font-semibold">Sunday check-in</span>
            <span className="block text-[14px] text-label-2">10 minutes to set up next week.</span>
          </span>
          <span className="flex-none text-label-4">
            <Icon name="chevron" size={18} strokeWidth={2.4} />
          </span>
        </Link>
      )}
      {day.checkInSkipped && <Card className="px-[18px] py-3.5 text-[15px] text-label-2">Check-in skipped. This week runs on last week's numbers.</Card>}

      <div className="flex flex-col gap-[18px] min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:items-start">
        <div className="flex flex-col gap-[18px]">
          <Card className="flex items-center gap-5 p-5">
            <Rings values={[pct(day.totals.kcal, day.targets.kcal), pct(day.totals.proteinG, day.targets.proteinG), pct(day.steps, day.targets.stepGoal)]} />
            <div className="tabular flex flex-col gap-2.5">
              <Stat label="Calories" color="text-calories" value={day.totals.kcal.toLocaleString()} of={`/${day.targets.kcal.toLocaleString()}`} />
              <Stat label="Protein" color="text-protein" value={String(day.totals.proteinG)} of={`/${day.targets.proteinG} g`} />
              <Stat label="Steps" color="text-steps" value={day.steps.toLocaleString()} of={`/${day.targets.stepGoal.toLocaleString()}`} />
            </div>
          </Card>

          <Card className="flex items-start gap-3 px-[18px] py-4">
            <div aria-hidden="true" className="flex size-[34px] flex-none items-center justify-center rounded-full bg-fill text-[15px] font-bold">
              R
            </div>
            <div>
              <div className="text-[13px] font-semibold text-label-2">Rocky</div>
              <p className="mt-[3px] text-[16px] leading-[1.4]">{message}</p>
            </div>
          </Card>

          {day.training ? (
            <Card className="overflow-hidden">
              <div className="relative h-[180px] bg-fill">
                <img src={day.training.heroImage} alt="" className="h-full w-full object-cover" />
                <span className="glass-on-image absolute left-3 top-3 flex h-[30px] items-center rounded-full px-3 text-[13px] font-semibold">12 to 2pm · ~45 min</span>
              </div>
              <div className="flex flex-col gap-1 px-[18px] pb-[18px] pt-4">
                <div className="text-[22px] font-bold">{day.training.name}</div>
                <div className="text-[15px] text-label-2">
                  {day.training.exerciseCount} exercises · {day.training.setCount} sets{day.weekType === "deload" ? " · deload week" : ""}
                </div>
                {day.training.goUps[0] && <div className="text-[15px] font-semibold text-steps-text">{day.training.goUps[0]}</div>}
                <div className="mt-3 flex gap-2.5">
                  <Link to="/workout" className="btn-prominent flex h-[50px] flex-1 items-center justify-center rounded-full text-[17px] font-semibold">
                    {day.loggedSetToday ? "Continue workout" : "Start workout"}
                  </Link>
                  <Link to="/workout?plan=b" className="btn-secondary flex h-[50px] items-center justify-center rounded-full px-[18px] text-[16px] font-semibold">
                    Plan B
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-between px-[18px] py-4">
              <div>
                <div className="text-[17px] font-semibold">Rest day</div>
                <div className="text-[14px] text-label-2">{day.optional ? `Optional: ${day.optional.name}, 30 min` : "Walk, recover, eat on plan."}</div>
              </div>
              {day.optional && (
                <Link to={`/workout?template=${day.optional.templateId}`} className="btn-secondary flex h-11 items-center rounded-full px-4 text-[15px] font-semibold">
                  Start
                </Link>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <section aria-label="Meals" className="flex flex-col gap-2">
            <SectionTitle right={day.relaxed ? "Holiday" : day.mode === "weekday" ? "Weekday" : "Weekend"}>Meals</SectionTitle>
            <Card className="overflow-hidden">
              {day.slots.map((s) => (
                <MealRow key={s.slot} s={s} upNext={s.slot === day.nextSlot} />
              ))}
            </Card>
            {day.offPlan.length > 0 && (
              <Card className="px-[18px] py-3">
                {day.offPlan.map((l) => (
                  <div key={l.id} className="tabular flex justify-between py-1 text-[15px]">
                    <span>
                      {l.name}
                      {l.relaxed && <span className="text-label-2"> · relaxed</span>}
                    </span>
                    <span className="text-label-2">{l.kcal} cal</span>
                  </div>
                ))}
              </Card>
            )}
            <button type="button" onClick={() => setOffPlanOpen(true)} className="btn-secondary ml-0.5 h-11 self-start rounded-full px-4 text-[15px] font-semibold">
              + Log off-plan
            </button>
          </section>

          <Card className="flex flex-col gap-3.5 p-[18px]">
            <div>
              <h2 className="text-[17px] font-semibold">Minimum viable day</h2>
              <p className="mt-0.5 text-[14px] leading-snug text-label-2">Hit these three and today counts, even if the rest goes sideways.</p>
            </div>
            <Bar label={`${day.targets.proteinG} g protein`} value={day.totals.proteinG} target={day.targets.proteinG} color="var(--protein)" />
            <Bar label={`${day.targets.stepGoal.toLocaleString()} steps`} value={day.steps} target={day.targets.stepGoal} color="var(--steps)" />
            <div className="flex justify-between text-[15px]">
              <span>No off-plan dessert</span>
              <span className="text-label-2">{day.offPlanDessert ? "Missed" : day.minutes >= 21 * 60 ? "Done" : "Tonight"}</span>
            </div>
            <div className="tabular flex justify-between border-t-[0.5px] border-separator pt-3 text-[15px]">
              <span className="text-label-2">Weigh-in</span>
              <span className="font-semibold">{day.weighIn !== null ? `${day.weighIn} lb${day.weighInTime ? ` · ${day.weighInTime}` : ""}` : "Not yet"}</span>
            </div>
          </Card>
        </div>
      </div>

      <OffPlanSheet open={offPlanOpen} onClose={() => setOffPlanOpen(false)} />
    </Screen>
  );
}

function Stat({ label, color, value, of }: { label: string; color: string; value: string; of: string }) {
  return (
    <div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[22px] font-bold ${color}`}>
        {value}
        <span className="text-[15px]">{of}</span>
      </div>
    </div>
  );
}

function Bar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const p = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="tabular flex justify-between text-[15px]">
        <span>{label}</span>
        <span className="text-label-2">
          {value.toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}>
        <div className="h-1.5 rounded-full" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
}

function WeighInCard() {
  const fetcher = useFetcher<typeof action>();
  return (
    <Card className="p-4">
      <fetcher.Form method="post" className="flex items-center gap-3">
        <input type="hidden" name="intent" value="weigh-in" />
        <label htmlFor="weight" className="flex-1 text-[16px] font-semibold">
          Log weigh-in
        </label>
        <div className="flex h-11 w-[120px] items-center gap-1.5 rounded-xl bg-fill px-3">
          <input id="weight" name="weight" inputMode="decimal" placeholder="0.0" required className="tabular w-full min-w-0 bg-transparent text-right text-[18px] font-semibold outline-none" />
          <span className="font-semibold text-label-2">lb</span>
        </div>
        <button type="submit" className="btn-prominent h-11 rounded-full px-4 text-[15px] font-semibold">
          Save
        </button>
      </fetcher.Form>
      {fetcher.data && "error" in fetcher.data && <p className="mt-2 text-[14px] text-calories">{fetcher.data.error}</p>}
    </Card>
  );
}

const PRESETS = [
  { name: "Restaurant meal", category: "meal", kcal: 900, protein: 50, relaxed: true },
  { name: "Ranch Water", category: "drink", kcal: 100, protein: 0, relaxed: false },
];

function OffPlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const submit = (fields: Record<string, string>) => {
    fetcher.submit({ intent: "off-plan", ...fields }, { method: "post" });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log off-plan">
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => submit({ name: p.name, category: p.category, kcal: String(p.kcal), protein: String(p.protein), ...(p.relaxed ? { relaxed: "on" } : {}) })}
            className="btn-secondary h-11 rounded-full px-4 text-[15px] font-semibold"
          >
            {p.name}
            {p.relaxed ? " (relaxed)" : ""}
          </button>
        ))}
      </div>
      <Form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          submit(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
          What was it
          <input name="name" required className="h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
          Category
          <select name="category" defaultValue="meal" className="h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none">
            <option value="meal">Meal</option>
            <option value="snack">Snack</option>
            <option value="dessert">Dessert</option>
            <option value="drink">Drink</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
            Calories
            <input name="kcal" inputMode="numeric" required className="tabular h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
            Protein (g)
            <input name="protein" inputMode="numeric" defaultValue="0" className="tabular h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none" />
          </label>
        </div>
        <label className="flex items-center justify-between text-[16px]">
          Relaxed meal (weekend restaurant)
          <input type="checkbox" name="relaxed" className="size-6 accent-[var(--steps)]" />
        </label>
        <button type="submit" className="btn-prominent mt-1 h-[52px] rounded-full text-[17px] font-semibold">
          Log it
        </button>
      </Form>
    </Sheet>
  );
}

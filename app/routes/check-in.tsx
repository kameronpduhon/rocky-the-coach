import { between } from "drizzle-orm";
import { useMemo, useState } from "react";
import { Form, Link, redirect } from "react-router";
import { COACH_NAME, pageTitle } from "~/brand";
import type { Route } from "./+types/check-in";
import { CallBlock } from "~/checkin/CallBlock";
import { callView, changedFoods, scaleChanges, type CallPick } from "~/checkin/call";
import { MealPhoto } from "~/components/MealPhoto";
import { Sheet } from "~/components/Sheet";
import { Toggle } from "~/components/Toggle";
import { BackButton, Card, FloatingBar, Icon, Screen, SectionTitle, Tile } from "~/components/ui";
import { meals } from "~/content";
import { factorFor } from "~/content/scaled";
import { userDb } from "~/server/current-user.server";
import { mealState, plannedMeals } from "~/db/schema";
import { addDays, localDate, weekStart, weekday } from "~/domain/dates";
import { encodeSwap, freshMeals, parseSwaps, previewWeek, swapFits, type MealSwap } from "~/domain/next-week";
import { SLOTS, slotPool, type Slot } from "~/domain/types";
import { checkInData, checkInWindow, completeCheckIn } from "~/server/checkin.server";
import { serverNow } from "~/server/clock.server";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Sunday check-in") }];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request }: Route.LoaderArgs) {
  const db = userDb();
  const now = serverNow();
  const param = new URL(request.url).searchParams.get("week");
  const window = checkInWindow(now);
  const monday = param && ISO.test(param) ? weekStart(param) : (window ?? weekStart(localDate(now)));
  const data = await checkInData(db, monday);
  const photos = new Map((await db.select().from(mealState).all()).map((s) => [s.slug, s.photoKey]));
  // A finished check-in already wrote next week; its swaps seed the page so the preview matches the plan.
  // A finished check-in already wrote next week. Show that plan as saved: regenerating it here would drift as
  // the new week's meals get eaten and change the rotation's inputs.
  const saved = data.done
    ? (await db.select().from(plannedMeals).where(between(plannedMeals.date, data.nextWeek.weekStart, addDays(data.nextWeek.weekStart, 6))).all()).map((r) => ({
        date: r.date,
        slot: r.slot as Slot,
        slug: r.mealSlug,
        swapped: r.swapped,
      }))
    : [];
  const savedPlan = saved.length === 35 ? saved.map(({ date, slot, slug }) => ({ date, slot, slug })) : null;
  const savedSwaps: MealSwap[] = saved.filter((r) => r.swapped).map(({ date, slot, slug }) => ({ date, slot, slug }));
  return {
    data,
    open: Boolean(param) || window !== null,
    savedSwaps,
    savedPlan,
    catalog: [...meals.values()].map((m) => ({
      slug: m.slug,
      name: m.name,
      pool: m.pool,
      mode: m.mode,
      tags: m.tags,
      kcal: m.kcal,
      protein: m.protein,
      foods: [...new Set(m.ingredients.map((i) => i.food))],
      photoKey: photos.get(m.slug) ?? null,
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const week = String(form.get("week"));
  if (!ISO.test(week)) return { error: "Bad week" };
  const waist = form.get("waist") ? Number(form.get("waist")) : null;
  await completeCheckIn(
    userDb(),
    weekStart(week),
    {
      waist: waist !== null && Number.isFinite(waist) && waist > 20 && waist < 60 ? Math.round(waist * 10) / 10 : null,
      choice: form.get("choice") === "steps" ? "steps" : "calories",
      rest: form.getAll("rest").map(String),
      swaps: parseSwaps(form.getAll("swap").map(String)),
    },
    serverNow(),
  );
  return redirect(`/groceries?week=${addDays(weekStart(week), 7)}`);
}

type Data = Route.ComponentProps["loaderData"]["data"];
type CatalogMeal = Route.ComponentProps["loaderData"]["catalog"][number];

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", dessert: "Dessert" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekRange(monday: string, sunday: string) {
  return `${short(monday)} to ${monday.slice(5, 7) === sunday.slice(5, 7) ? Number(sunday.slice(8)) : short(sunday)}`;
}

export default function CheckIn({ loaderData }: Route.ComponentProps) {
  const { data: d, open, catalog, savedSwaps, savedPlan } = loaderData;
  const [choice, setChoice] = useState<CallPick>(d.savedPick ?? d.call.pick);
  const [rest, setRest] = useState<string[]>(d.mealCounts.filter((m) => m.defaultRest).map((m) => m.slug));
  const [swaps, setSwaps] = useState<MealSwap[]>(savedSwaps);
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const bySlug = useMemo(() => new Map(catalog.map((m) => [m.slug, m])), [catalog]);
  const rotation = useMemo(() => catalog.map(({ slug, pool, mode, tags }) => ({ slug, pool, mode, tags })), [catalog]);
  const rested = useMemo(() => [...d.nextWeek.restedBefore, ...rest], [d.nextWeek.restedBefore, rest]);
  const week = useMemo(
    () =>
      savedPlan
        ? savedPlan.map((p) => {
            const swap = swaps.find((s) => s.date === p.date && s.slot === p.slot);
            return swap && swapFits(swap, rotation, rested) ? { ...p, slug: swap.slug } : p;
          })
        : previewWeek({ weekStart: d.nextWeek.weekStart, meals: rotation, lastEaten: d.nextWeek.lastEaten, rested, swaps }),
    [savedPlan, d.nextWeek, rotation, rested, swaps],
  );
  const fresh = freshMeals(
    week.map((p) => p.slug),
    d.nextWeek.eatenThisWeek,
    (slug) => bySlug.get(slug)?.pool,
  ).map((slug) => bySlug.get(slug)!.name);
  // The grams start from this week's target as eaten and end at what the pick brings on Monday.
  const slugs = week.map((p) => p.slug);
  const nowFactor = factorFor(d.thisWeekKcal);
  const facts = { call: d.call, energy: d.energy, lastBurn: d.lastBurn, kcal: d.kcal, stepGoal: d.stepGoal, proteinG: d.proteinG, weekNumber: d.weekNumber };
  const view = callView(facts, choice, changedFoods(scaleChanges(slugs, nowFactor, factorFor(d.call.calories.kcal))));
  const changes = scaleChanges(slugs, nowFactor, factorFor(view.kcal));
  const groceryCount = new Set(week.flatMap((p) => bySlug.get(p.slug)?.foods ?? [])).size;
  const liveSwaps = swaps.filter((s) => swapFits(s, rotation, rested));
  const groceryParams = new URLSearchParams([["week", d.nextWeek.weekStart], ["from", "check-in"]]);
  if (!d.done) {
    if (rest.length === 0) groceryParams.append("rest", "");
    for (const slug of rest) groceryParams.append("rest", slug);
    for (const s of liveSwaps) groceryParams.append("swap", encodeSwap(s));
  }

  return (
    <Screen>
      <BackButton to="/plan" label="Back to Plan" />
      <header className="px-1 leading-[normal]">
        <div className="tabular text-[15px] font-semibold text-label-2">
          {d.weekNumber > 0 ? `Week ${d.weekNumber} · ` : ""}
          {weekRange(d.weekStart, d.weekEnd)}
        </div>
        <h1 className="mt-0.5 text-[34px] font-bold">Sunday check-in</h1>
        <p className="mt-1.5 text-[15px] text-label-2">About 10 minutes, all on one page.</p>
      </header>
      {d.done && (
        <Card className="flex items-center gap-3 px-[18px] py-3.5">
          <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-full bg-steps text-black">
            <Icon name="check" size={15} strokeWidth={3.2} />
          </span>
          <p className="text-[15px] font-semibold">Done for this week. Changes start Monday.</p>
        </Card>
      )}
      {!open && !d.done && <Card className="px-[18px] py-3.5 text-[15px] text-label-2">The check-in opens Sunday at 5pm. Here's the week so far.</Card>}

      <Form method="post" className="flex flex-col gap-5">
        <input type="hidden" name="week" value={d.weekStart} />
        <input type="hidden" name="choice" value={choice} />
        {rest.map((slug) => (
          <input key={slug} type="hidden" name="rest" value={slug} />
        ))}
        {liveSwaps.map((s) => (
          <input key={`${s.date}-${s.slot}`} type="hidden" name="swap" value={encodeSwap(s)} />
        ))}

        <section aria-label="How the week went" className="flex flex-col gap-2">
          <SectionTitle>How the week went</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="Trend" value={d.trendWeight !== null ? `${d.trendWeight} lb` : "--"} sub={d.change !== null ? `${signed(d.change)} vs last week` : "Not enough weigh-ins"} subGood={(d.change ?? 0) < 0} />
            <Tile label="Days on plan" value={`${d.adherence} of 7`} sub={d.relaxedMeals > 0 ? `${d.relaxedMeals} relaxed meal${d.relaxedMeals === 1 ? "" : "s"}` : d.onPlan ? "On plan" : "Below 6 of 7"} />
            <Tile label="Workouts" value={`${d.workoutsDone} of ${d.workoutsPlanned}`} sub={d.optionalDone ? `+${d.optionalDone} optional` : "Mon, Wed, Fri"} />
            <Tile label="Avg steps" value={d.avgSteps.toLocaleString()} sub={`goal ${d.stepGoal.toLocaleString()}`} valueGood={d.avgSteps >= d.stepGoal} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[6px] bg-card px-4 py-3.5">
            <label htmlFor="waist" className="text-[16px] font-medium">
              Waist
            </label>
            <div className="flex h-11 w-[120px] items-center gap-1.5 rounded-[6px] bg-fill px-3">
              <input id="waist" name="waist" inputMode="decimal" defaultValue={d.waist ?? ""} placeholder="0.0" className="tabular w-full min-w-0 bg-transparent text-right text-[18px] font-semibold outline-none" />
              <span className="font-semibold text-label-on-fill">in</span>
            </div>
          </div>
        </section>

        <CallBlock view={view} choice={choice} onChoice={setChoice} changes={changes} />

        <section aria-label="Next week's meals" className="flex flex-col gap-2">
          <SectionTitle>Next week's meals</SectionTitle>
          <p className="px-1 text-[14px] leading-[1.4] text-label-2">Tired of something? Rest it and {COACH_NAME} keeps it off the menu for a couple of weeks.</p>
          {d.mealCounts.length > 0 ? (
            <Card className="overflow-hidden">
              {d.mealCounts.map((m) => (
                <div key={m.slug} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                  <MealPhoto photoKey={bySlug.get(m.slug)?.photoKey ?? null} alt="" className="size-12 flex-none rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold">{m.name}</div>
                    <div className="tabular mt-px text-[14px] font-semibold text-warn">Eaten {m.count} times this week</div>
                  </div>
                  <Toggle on={rest.includes(m.slug)} label={`Rest ${m.name}`} onChange={(on) => setRest((r) => (on ? [...r, m.slug] : r.filter((s) => s !== m.slug)))} />
                </div>
              ))}
            </Card>
          ) : (
            <Card className="px-4 py-3.5 text-[15px] text-label-2">Nothing eaten 3 or more times this week. Good variety.</Card>
          )}

          {fresh.length > 0 && <div className="mx-1 mt-2 text-[15px] font-semibold">New this week</div>}
          <div className="flex flex-wrap items-center gap-2">
            {fresh.map((name) => (
              <span key={name} className="flex h-11 items-center rounded-full bg-card px-4 text-[14px] font-medium text-label-2">
                {name}
              </span>
            ))}
            <Link to="/library" className="btn-secondary flex h-11 items-center rounded-full px-4 text-[14px] font-semibold">
              + Library
            </Link>
          </div>

          <div className="mx-1 mt-2 flex items-baseline justify-between">
            <span className="text-[15px] font-semibold">Next week</span>
            <span className="text-[13px] text-label-2">Lunch on top. Tap a day for all 5</span>
          </div>
          <Card className="overflow-hidden" aria-label="Next week's plan">
            {Array.from({ length: 7 }, (_, i) => addDays(d.nextWeek.weekStart, i)).map((date) => {
              const day = week.filter((p) => p.date === date);
              const name = (slot: Slot) => bySlug.get(day.find((p) => p.slot === slot)?.slug ?? "")?.name ?? "";
              const swapCount = liveSwaps.filter((s) => s.date === date).length;
              return (
                <button key={date} type="button" onClick={() => setDayOpen(date)} className="group flex w-full items-center gap-3.5 pl-4 text-left leading-[normal]">
                  <span aria-hidden="true" className="flex size-11 flex-none flex-col items-center justify-center rounded-full bg-fill leading-none">
                    <span className="text-[13px] font-bold text-label-on-fill">{DOW[weekday(date)].toUpperCase()}</span>
                    <span className="tabular text-[17px] font-bold">{Number(date.slice(8))}</span>
                  </span>
                  <span className="sr-only">
                    {`${DOW[weekday(date)]} ${short(date)}: ${SLOTS.map((slot) => `${SLOT_LABEL[slot]} ${name(slot)}`).join(", ")}${swapCount > 0 ? `, ${swapCount} swapped` : ""}`}
                  </span>
                  {/* The hairline starts after the day badge, like the inset separators in iOS lists. */}
                  <span aria-hidden="true" className="flex h-[66px] min-w-0 flex-1 items-center gap-2.5 border-b-[0.5px] border-separator pr-4 group-last:border-b-0">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[16px] font-semibold">{name("lunch")}</span>
                      <span className="mt-px truncate text-[13px] text-label-2">
                        Dinner · {name("dinner")}
                        {swapCount > 0 ? ` · ${swapCount} swapped` : ""}
                      </span>
                    </span>
                    <span className="flex-none text-label-4">
                      <Icon name="chevron" size={18} strokeWidth={2.4} />
                    </span>
                  </span>
                </button>
              );
            })}
          </Card>
        </section>

        <section aria-label="Groceries" className="flex flex-col gap-2">
          <SectionTitle>Groceries</SectionTitle>
          <Link to={`/groceries?${groceryParams}`} className="flex min-h-[60px] items-center justify-between gap-3 rounded-[6px] bg-card px-[18px] py-4">
            <span>
              <span className="block text-[16px] font-semibold">Grocery list ready</span>
              <span className="tabular mt-px block text-[14px] text-label-2">{groceryCount} items from next week's meals</span>
            </span>
            <span className="flex-none text-label-4">
              <Icon name="chevron" size={18} strokeWidth={2.4} />
            </span>
          </Link>
        </section>

        <FloatingBar>
          <button type="submit" disabled={!open && !d.done} className="btn-prominent h-[54px] w-full rounded-full text-[17px] font-semibold disabled:opacity-60">
            {d.done ? "Update check-in" : open ? "Finish check-in" : "Opens Sunday at 5pm"}
          </button>
        </FloatingBar>
      </Form>

      <DaySheet
        date={dayOpen}
        meals={week.filter((p) => p.date === dayOpen).map((p) => ({ slot: p.slot, meal: bySlug.get(p.slug)!, swapped: liveSwaps.some((s) => s.date === p.date && s.slot === p.slot) }))}
        optionsFor={(slot, current) => catalog.filter((m) => dayOpen !== null && m.slug !== current && swapFits({ date: dayOpen, slot, slug: m.slug }, rotation, rested))}
        onClose={() => setDayOpen(null)}
        onPick={(slot, slug) => {
          if (!dayOpen) return;
          setSwaps((all) => [...all.filter((s) => s.date !== dayOpen || s.slot !== slot), { date: dayOpen, slot, slug }]);
        }}
      />
    </Screen>
  );
}

function DaySheet({
  date,
  meals: dayMeals,
  optionsFor,
  onClose,
  onPick,
}: {
  date: string | null;
  meals: { slot: Slot; meal: CatalogMeal; swapped: boolean }[];
  optionsFor: (slot: Slot, current: string) => CatalogMeal[];
  onClose: () => void;
  onPick: (slot: Slot, slug: string) => void;
}) {
  const [picking, setPicking] = useState<Slot | null>(null);
  const close = () => {
    setPicking(null);
    onClose();
  };
  const current = dayMeals.find((m) => m.slot === picking);
  const title = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  return (
    <Sheet open={date !== null} onClose={close} title={picking ? `Swap ${SLOT_LABEL[picking].toLowerCase()}` : title}>
      {picking && current ? (
        <>
          <button type="button" onClick={() => setPicking(null)} className="mb-3 flex h-11 items-center gap-1 px-1 text-[15px] font-semibold text-label-2">
            <Icon name="back" size={16} strokeWidth={2.4} />
            {title}
          </button>
          <p className="mb-3 px-1 text-[14px] text-label-2">
            Instead of {current.meal.name}. {slotPool(picking) === "main" ? "Lunch and dinner meals" : "Meals for this slot"} that fit the day.
          </p>
          <div className="overflow-hidden rounded-[6px] bg-card">
            {[...optionsFor(picking, current.meal.slug)]
              .sort((a, b) => b.protein - a.protein)
              .map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => {
                    onPick(picking, m.slug);
                    setPicking(null);
                  }}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0"
                >
                  <span className="text-[16px] font-semibold">{m.name}</span>
                  <span className="tabular flex-none text-[14px] text-label-2">
                    {m.kcal} cal · {m.protein} g
                  </span>
                </button>
              ))}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-[6px] bg-card">
          {dayMeals.map(({ slot, meal, swapped }) => (
            <button
              key={slot}
              type="button"
              onClick={() => setPicking(slot)}
              className="flex min-h-[60px] w-full items-center gap-3 border-b-[0.5px] border-separator px-4 py-2.5 text-left leading-[1.25] last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-label-2">
                  {SLOT_LABEL[slot]}
                  {swapped ? " · swapped" : ""}
                </span>
                <span className="mt-0.5 block text-[16px] font-semibold">{meal.name}</span>
              </span>
              <span className="flex flex-none items-center gap-1 text-[14px] font-semibold text-label-2">
                <Icon name="swap" size={15} />
                Swap
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

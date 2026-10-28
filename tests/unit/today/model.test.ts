import { describe, expect, it } from "vitest";
import { exercises, meals, plan } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import type { SlotModel } from "~/today/model";
import { buildToday, type PlanToday } from "~/today/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const pick = (pool: string) => [...meals.values()].find((m) => m.pool === pool && m.mode === "any")!;
const SLUGS = { breakfast: pick("breakfast").slug, lunch: pick("main").slug, snack: pick("snack").slug, dinner: [...meals.values()].filter((m) => m.pool === "main" && m.mode === "any")[1]!.slug, dessert: pick("dessert").slug };

function planned(date: string): Row[] {
  return Object.entries(SLUGS).map(([slot, meal_slug]) => ({ date, slot, meal_slug, swapped: 0 }));
}

function ate(date: string, slot: string, id: number, loggedAt: string): Row {
  const m = meals.get(SLUGS[slot as keyof typeof SLUGS])!;
  return { id, client_id: null, date, slot, meal_slug: m.slug, name: m.name, category: "planned", kcal: m.kcal, protein_g: m.protein, relaxed: 0, portions: 1, logged_at: loggedAt };
}

function dessert(date: string, id: number): Row {
  return { id, client_id: null, date, slot: null, meal_slug: null, name: "Cookie", category: "dessert", kcal: 200, protein_g: 2, relaxed: 0, portions: 1, logged_at: `${date}T02:00:00Z` };
}

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const asPlan = (m: ReturnType<typeof buildToday>) => {
  if (!m.hasPlan) throw new Error("expected a plan");
  return m as PlanToday;
};

const WED = "2026-10-28";
const legs = plan.templates["wed-legs-shoulders"]!;
const firstLift = exercises.get(legs.exercises[0].exercise)!;

describe("buildToday", () => {
  it("shows the day's meals at the trimmed grams after a cut", () => {
    const targets: Row[] = [{ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 }];
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), targets }), at(WED, "08:00"), true));
    for (const s of m.slots) expect(s.meal).toEqual(scaledMeal(meals.get(SLUGS[s.slot])!, factorFor(2300)));
  });

  it("leaves a skipped meal out of the off-plan list and the counted day", () => {
    const skip: Row = { id: 5, client_id: null, date: WED, slot: "lunch", meal_slug: null, name: "Lunch", category: "skipped", kcal: 0, protein_g: 0, relaxed: 0, portions: 1, logged_at: `${WED}T19:00:00Z` };
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: [skip] }), at(WED, "20:00"), true));
    expect(m.offPlan).toEqual([]);
    expect(m.week.find((d) => d.today)!.counted).toBe(false);
  });

  it("before the lift shows the workout poster with the split, sets and week", () => {
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`)] }), at(WED, "09:00"), true));
    expect(m.next).toEqual({ kind: "workout", templateId: "wed-legs-shoulders", started: false });
    expect(m.training?.headline).toEqual(["Legs.", "Shoulders.", "6 lifts."]);
    expect(m.training?.meta).toBe("Noon · 12 sets · about 45 min · week 4 of 13");
    expect(m.training?.buttonLabel).toBe(`Start: ${firstLift.name}`);
    expect(m.dateLabel).toBe("WED · OCT 28");
  });

  it("says what goes up when every set hit the top last time", () => {
    const lastWed = "2026-10-21";
    const sets: Row[] = [1, 2].map((n) => ({ id: n, session_id: 9, session_key: "id:9", exercise_id: firstLift.id, position: 0, set_number: n, weight_lb: 270, reps: legs.exercises[0].repMax, logged_at: `${lastWed}T17:00:00Z`, client_id: null }));
    const m = asPlan(
      buildToday(
        rowsOf({ planned_meals: planned(WED), workout_sessions: [{ id: 9, date: lastWed, template_id: "wed-legs-shoulders", started_at: `${lastWed}T17:00:00Z`, ended_at: `${lastWed}T18:00:00Z`, exercises: null }], set_logs: sets }),
        at(WED, "09:00"),
        true,
      ),
    );
    expect(m.training?.goUp).toBe(`${firstLift.name}: both sets hit ${legs.exercises[0].repMax} last time. Add ${firstLift.increment} lb today.`);
  });

  it("shows the next meal with its scale grams when breakfast is due", () => {
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED) }), at(WED, "08:00"), true));
    expect(m.next).toEqual({ kind: "meal", slot: "breakfast" });
    const breakfast = m.slots.find((s: SlotModel) => s.slot === "breakfast")!;
    expect(breakfast.next).toBe(true);
    expect(breakfast.time).toBe("7:30");
  });

  it("totals what was eaten and marks the eaten row", () => {
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`)] }), at(WED, "09:00"), true));
    const b = meals.get(SLUGS.breakfast)!;
    expect(m.totals).toEqual({ kcal: b.kcal, proteinG: b.protein });
    expect(m.slots[0].logKey).toBe("id:1");
  });

  it("falls back to a fitting meal when the week has not synced yet", () => {
    const m = asPlan(buildToday(rowsOf({}), at(WED, "08:00"), true));
    expect(m.slots).toHaveLength(5);
    expect(m.slots.every((s) => s.meal)).toBe(true);
  });

  it("opens the check-in on Sunday evening until it is done", () => {
    const SUN = "2026-10-25";
    expect(asPlan(buildToday(rowsOf({ planned_meals: planned(SUN) }), at(SUN, "17:30"), true)).next).toEqual({ kind: "check-in" });
    const done = rowsOf({ planned_meals: planned(SUN), check_ins: [{ week_start: "2026-10-19" }] });
    expect(asPlan(buildToday(done, at(SUN, "17:30"), true)).next.kind).not.toBe("check-in");
  });

  it("counts desserts against the allowance for the week", () => {
    const two = rowsOf({ planned_meals: planned(WED), meal_logs: [dessert("2026-10-26", 1), dessert(WED, 2)] });
    expect(asPlan(buildToday(two, at(WED, "09:00"), true)).dessertLine).toBe("0 of 2 left this week");
    const three = rowsOf({ planned_meals: planned(WED), meal_logs: [dessert("2026-10-26", 1), dessert("2026-10-27", 2), dessert(WED, 3)] });
    expect(asPlan(buildToday(three, at(WED, "09:00"), true)).dessertLine).toBe("3 this week");
  });

  it("builds the streak and the week strip from counted days", () => {
    const weighIns: Row[] = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", WED].map((date) => ({ date, weight_lb: 205, logged_at: `${date}T11:52:00Z` }));
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), weigh_ins: weighIns }), at(WED, "09:00"), true));
    expect(m.streak).toBe(5);
    expect(m.week.map((d) => d.counted)).toEqual([true, true, true, false, false, false, false]);
    expect([m.countedSoFar, m.daysSoFar]).toEqual([3, 3]);
    expect(m.countedLine).toBe("Your 6:52am weigh-in made today count.");
  });

  it("without a plan gives only the weigh-in, steps and streak", () => {
    const m = buildToday(rowsOf({ weigh_ins: [{ date: WED, weight_lb: 141.4, logged_at: `${WED}T12:10:00Z` }], steps_daily: [{ date: WED, steps: 5200, updated_at: "" }] }), at(WED, "09:00"), false);
    expect(m.hasPlan).toBe(false);
    expect(m.weighIn?.weight).toBe(141.4);
    expect(m.steps).toBe(5200);
  });

  const lastWedSession = (feel: string | null) => ({
    workout_sessions: [{ id: 9, client_id: null, date: "2026-10-21", template_id: "wed-legs-shoulders", started_at: "2026-10-21T17:00:00Z", ended_at: "2026-10-21T18:00:00Z", exercises: null, feel }],
    set_logs: [1, 2].map((n) => ({ id: n, client_id: null, session_id: 9, session_key: "id:9", exercise_id: firstLift.id, position: 0, set_number: n, weight_lb: 270, reps: 12, logged_at: "2026-10-21T17:05:00Z" })),
  });
  const breakfastEaten = { planned_meals: planned(WED), meal_logs: [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`)] };

  it("lets an easy last session put two steps on the go-up note, and a hard one hold", () => {
    const easy = asPlan(buildToday(rowsOf({ ...breakfastEaten, ...lastWedSession("easy") }), at(WED, "09:00"), true));
    expect(easy.training?.goUp).toBe(`${firstLift.name}: both sets hit 12 last time and it felt easy. Add 20 lb today.`);
    const hard = asPlan(buildToday(rowsOf({ ...breakfastEaten, ...lastWedSession("hard") }), at(WED, "09:00"), true));
    expect(hard.training?.goUp).toBeNull();
  });

  it("shows a workout planned but not started, with Start and the change link", () => {
    const planB = plan.templates[plan.planB]!;
    const workout_sessions = [{ id: null, client_id: "w-1", date: WED, template_id: plan.planB, started_at: null, ended_at: null, planned_at: `${WED}T13:00:00Z`, lifts: null, feel: null, exercises: null }];
    const m = asPlan(buildToday(rowsOf({ ...breakfastEaten, workout_sessions }), at(WED, "09:00"), true));
    expect(m.next).toEqual({ kind: "workout", templateId: plan.planB, started: false });
    expect(m.training).toMatchObject({ templateId: plan.planB, headline: ["Short.", "Home.", "6 lifts."], started: false, workoutKey: "w-1", buttonLabel: `Start: ${exercises.get(planB.exercises[0].exercise)!.name}` });
    expect(m.canChange).toBe(true);
  });

  it("counts a set logged offline, before its workout has a server id", () => {
    // No meal eaten, so only the set can make the day count.
    const rows = rowsOf({
      planned_meals: planned(WED),
      workout_sessions: [{ id: null, client_id: "w-1", date: WED, template_id: "wed-legs-shoulders", started_at: `${WED}T17:00:00Z`, ended_at: null, planned_at: null, lifts: null, feel: null, exercises: null }],
      set_logs: [{ id: null, client_id: "s-1", session_id: null, session_key: "w-1", exercise_id: firstLift.id, position: 0, set_number: 1, weight_lb: 280, reps: 11, logged_at: `${WED}T17:05:00Z` }],
    });
    const m = asPlan(buildToday(rows, at(WED, "12:10"), true));
    expect(m.training).toMatchObject({ started: true, buttonLabel: `Resume: ${firstLift.name}` });
    expect(m.canChange).toBe(false);
    expect(m.week.find((d) => d.today)?.counted).toBe(true);
  });

  it("answers a skipped slot, so the poster and the list move on to the next meal", () => {
    const skip: Row = { id: null, client_id: "s-1", date: WED, slot: "lunch", meal_slug: null, name: "Lunch", category: "skipped", kcal: 0, protein_g: 0, relaxed: 0, portions: 1, logged_at: `${WED}T19:00:00Z` };
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`), skip] }), at(WED, "14:30"), true));
    expect(m.slots.find((s) => s.slot === "lunch")).toMatchObject({ logKey: null, skipKey: "s-1", next: false });
    expect(m.slots.find((s) => s.next)?.slot).toBe("snack");
    expect(m.next).toEqual({ kind: "meal", slot: "snack" });
  });
});

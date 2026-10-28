import { describe, expect, it } from "vitest";
import { buildPlan, type PlanModel } from "~/plan/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const MON = "2026-10-26";
const TUE = "2026-10-27";
const WED = "2026-10-28";
const SAT = "2026-10-31";
const days = (m: PlanModel) => m.days.map((d) => [d.weekday, d.title, d.sub]);
const session = (o: Row): Row => ({ id: null, client_id: "w-mon", date: MON, template_id: "mon-chest-back-arms", started_at: `${MON}T17:00:00Z`, ended_at: `${MON}T18:00:00Z`, lifts: null, feel: null, ...o });
let n = 0;
const set = (o: Row): Row => ({ id: null, client_id: `s-${++n}`, session_key: "w-mon", exercise_id: "pec-deck", position: 1, set_number: 1, weight_lb: 130, reps: 12, logged_at: `${MON}T17:05:00Z`, ...o });
// Monday: pec deck and lat pulldown hit the top of 8 to 12 on both sets, so they move up. Incline press (6 to 10) didn't.
const monday = {
  workout_sessions: [session({})],
  set_logs: [
    set({ exercise_id: "incline-dumbbell-press", position: 0, weight_lb: 55, reps: 9 }),
    set({ exercise_id: "incline-dumbbell-press", position: 0, set_number: 2, weight_lb: 55, reps: 8 }),
    set({}),
    set({ set_number: 2 }),
    set({ exercise_id: "lat-pulldown", position: 2, weight_lb: 125 }),
    set({ exercise_id: "lat-pulldown", position: 2, set_number: 2, weight_lb: 125 }),
  ],
};
const weekend: Row[] = [
  { date: SAT, slot: "breakfast", meal_slug: "steak-and-eggs", swapped: 0 },
  { date: SAT, slot: "dinner", meal_slug: "chicken-fajita-bowl", swapped: 0 },
  { date: SAT, slot: "lunch", meal_slug: "steak-salad", swapped: 0 },
];
const targets: Row[] = [
  { effective_from: "2026-10-19", kcal: 2400, protein_g: 180, step_goal: 7000 },
  { effective_from: MON, kcal: 2300, protein_g: 180, step_goal: 7500 },
];

describe("buildPlan", () => {
  it("reads week 4: the poster, the strip and its legend", () => {
    const m = buildPlan(rowsOf({}), at(WED, "09:00"));
    expect(m.poster).toEqual(["Week 4", "of 13."]);
    expect(m.meta).toBe("Oct 26 to Nov 1 · Phase 1 ends Jan 1");
    expect(m.cells.map((c) => c.state)).toEqual(["done", "done", "done", "current", ...Array(9).fill("ahead")]);
    expect(m.cells.filter((c) => c.type !== "standard").map((c) => [c.n, c.type])).toEqual([
      [8, "deload"],
      [12, "maintenance"],
      [13, "checkpoint"],
    ]);
    // Each date is that week's Monday; the checkpoint's is the goal date.
    expect(m.legend.map((l) => l.text)).toEqual(["Wk 8 deload, Nov 23", "Wk 12 maintenance, Dec 21", "Wk 13 checkpoint, Jan 1"]);
  });

  it("lists the week Monday first, from what was logged and what is planned", () => {
    const m = buildPlan(rowsOf({ ...monday, planned_meals: weekend, targets }), at(WED, "09:00"));
    expect(days(m)).toEqual([
      ["MON", "Chest, back, arms", "Done · 2 lifts moved up"],
      ["TUE", "Rest", "Arms and back extra, skipped"],
      ["WED", "Legs, shoulders", "Today · noon · 6 lifts"],
      // 4 lifts x 2 sets, at the workout screen's 3.5 minutes a set plus 5 to warm up: 35.
      ["THU", "Rest", "Optional: arms and back extra, 35 min"],
      ["FRI", "Chest, shoulders, arms", "Noon · 6 lifts · tap to change"],
      ["SAT", "Rest · weekend meals", "Steak salad, chicken fajita bowl"],
      ["SUN", "Rest · weekend meals", "Check-in opens at 5pm"],
    ]);
    expect(m.days.map((d) => [d.today, d.done, d.to, d.sheet?.action ?? null])).toEqual([
      [false, true, "/workout?date=2026-10-26&from=plan", null],
      [false, false, null, null],
      [true, false, "/workout", null],
      [false, false, null, "train"],
      [false, false, null, "move"],
      [false, false, null, null],
      [false, false, "/check-in", null],
    ]);
    expect(m.days[4].sheet).toEqual({
      title: "Friday",
      workout: "Chest, shoulders, arms",
      lifts: [
        { name: "Flat dumbbell press", sets: "2 × 6 to 10" },
        { name: "Cable fly, low to high", sets: "2 × 10 to 12" },
        { name: "Dumbbell lateral raise", sets: "2 × 10 to 15" },
        { name: "Reverse pec deck", sets: "2 × 10 to 15" },
        { name: "Incline dumbbell curl", sets: "2 × 8 to 12" },
        { name: "Overhead cable triceps extension", sets: "2 × 8 to 12" },
      ],
      action: "move",
    });
    expect(m.days[3].sheet?.lifts.map((l) => l.name)).toEqual(["Pull-ups", "Cable lateral raise", "Hammer curl", "Rope pushdown"]);
  });

  it("asks to log a past workout that wasn't, and marks a done extra", () => {
    const extra = {
      workout_sessions: [session({ client_id: "w-tue", date: TUE, template_id: "optional-arms-back" })],
      set_logs: [set({ session_key: "w-tue", exercise_id: "hammer-curl", position: 2, weight_lb: 30, reps: 10 })],
    };
    const m = buildPlan(rowsOf(extra), at(WED, "09:00"));
    expect(days(m).slice(0, 2)).toEqual([
      ["MON", "Chest, back, arms", "Not logged · tap to log it"],
      ["TUE", "Rest", "Arms and back extra · Done"],
    ]);
    expect(m.days[0]).toMatchObject({ done: false, to: "/workout?date=2026-10-26&from=plan" });
    expect(m.days[1]).toMatchObject({ done: true, to: "/workout?date=2026-10-27&from=plan" });
  });

  it("shows today's workout as edited, then done with what moved up", () => {
    const lifts = [
      { position: 0, exercise: "leg-press", repMin: 8, repMax: 12, from: "plan" },
      { position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" },
    ];
    const planned = session({ client_id: "w-wed", date: WED, template_id: "wed-legs-shoulders", started_at: null, ended_at: null, lifts: JSON.stringify(lifts) });
    expect(buildPlan(rowsOf({ workout_sessions: [planned] }), at(WED, "09:00")).days[2].sub).toBe("Today · noon · 2 lifts, edited");
    const finished = {
      workout_sessions: [session({ client_id: "w-wed", date: WED, template_id: "wed-legs-shoulders", started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z` })],
      set_logs: [set({ session_key: "w-wed", exercise_id: "leg-press", position: 0, weight_lb: 280 }), set({ session_key: "w-wed", exercise_id: "leg-press", position: 0, set_number: 2, weight_lb: 280 })],
    };
    expect(buildPlan(rowsOf(finished), at(WED, "19:00")).days[2]).toMatchObject({ sub: "Today · done · 1 lift moved up", done: true, to: "/workout" });
  });

  it("offers today's extra on a rest day", () => {
    expect(buildPlan(rowsOf({}), at("2026-10-29", "09:00")).days[3]).toMatchObject({ title: "Rest", sub: "Today · optional: arms and back extra, 35 min", today: true, to: "/workout" });
  });

  it("makes Thanksgiving a relaxed day", () => {
    expect(buildPlan(rowsOf({}), at("2026-11-25", "09:00")).days[3]).toMatchObject({ title: "Relaxed day", sub: "Counts no matter what", to: null, sheet: null });
  });

  it("says when the check-in opens, is open, and is done", () => {
    // Nov 1 is on standard time, so these read an hour earlier in Chicago: 3pm, 6pm and 6:30pm.
    expect(buildPlan(rowsOf({}), at("2026-11-01", "16:00")).days[6].sub).toBe("Check-in opens at 5pm");
    expect(buildPlan(rowsOf({}), at("2026-11-01", "19:00")).days[6].sub).toBe("Check-in is open");
    expect(buildPlan(rowsOf({ check_ins: [{ week_start: MON, completed_at: "2026-11-01T23:30:00Z" }] }), at("2026-11-01", "19:30")).days[6].sub).toBe("Check-in done");
  });

  it("follows a moved workout", () => {
    const moves: Row[] = [
      { date: "2026-10-30", template_id: null },
      { date: SAT, template_id: "fri-chest-shoulders-arms" },
    ];
    const m = buildPlan(rowsOf({ schedule_moves: moves }), at(WED, "09:00"));
    expect(days(m).slice(4, 6)).toEqual([
      ["FRI", "Rest", "Workout moved"],
      ["SAT", "Chest, shoulders, arms", "Noon · 6 lifts · tap to change"],
    ]);
    expect(m.days[4].sheet?.action).toBe("train");
    expect(m.schedule.map((d) => d.templateId)).toEqual(["mon-chest-back-arms", null, "wed-legs-shoulders", null, null, "fri-chest-shoulders-arms", null]);
  });

  it("says where each target came from", () => {
    const cells = (t: Row[], date = WED) => buildPlan(rowsOf({ targets: t }), at(date, "09:00")).targets.map((c) => [c.label, c.value, c.sub]);
    expect(cells([])).toEqual([
      ["Calories", "2,400", "starting target"],
      ["Protein", "180 g", "every day"],
      ["Steps", "7,000", "starting goal"],
    ]);
    expect(cells(targets)).toEqual([
      ["Calories", "2,300", "from the check-in"],
      ["Protein", "180 g", "every day"],
      ["Steps", "7,500", "up 500"],
    ]);
    // Week 12 eats the plan's 2,800 before any check-in has a burn. The step goal didn't move at the last check-in.
    const later: Row[] = [targets[1], { effective_from: "2026-12-14", kcal: 2200, protein_g: 180, step_goal: 7500 }];
    expect(cells(later, "2026-12-23")).toEqual([
      ["Calories", "2,800", "maintenance week"],
      ["Protein", "180 g", "every day"],
      ["Steps", "7,500", "same as last week"],
    ]);
  });

  it("counts this week's groceries", () => {
    expect(buildPlan(rowsOf({}), at(WED, "09:00")).groceries).toEqual({ checked: 0, count: 37 });
  });
});

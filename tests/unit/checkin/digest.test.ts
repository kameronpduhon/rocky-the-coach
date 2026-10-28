import { describe, expect, it } from "vitest";
import { buildDigest, digestNumbers, numbersIn, type CheckInChoices } from "~/checkin/digest";
import { BOWL, checkInRow, rowsOf, SHOULDER, THIGHS, weekThree } from "./fixture";

const NONE: CheckInChoices = { hunger: null, energy: null, sleep: null, rest: null };

describe("buildDigest", () => {
  it("gathers every number the week page shows (see weekThree for the arithmetic)", () => {
    expect(buildDigest(rowsOf(weekThree()), "2026-10-19", NONE)).toEqual({
      week: { monday: "2026-10-19", sunday: "2026-10-25", number: 3, weeksToCheckpoint: 10 },
      // Since Oct 5's trend of 205.99: 205.092 - 205.99 = -0.898.
      weight: { trend: 205.1, change: -0.4, sinceStart: -0.9, firstDate: "2026-10-05", firstWeight: 205.9 },
      days: { counted: 7, full: 4, tracked: 6, total: 7 },
      protein: { avg: 170, target: 180, lowDay: { date: "2026-10-22", grams: 120 } },
      steps: { avg: 7443, goal: 7000, lowDay: { date: "2026-10-24", steps: 5900 } },
      intake: { avg: 2400 },
      lifts: {
        planned: 3,
        plannedDone: 2,
        extras: ["2026-10-20"],
        missed: ["2026-10-23"],
        movedUp: [
          { exercise: "incline-dumbbell-press", name: "Incline dumbbell press", from: 50, to: 55 },
          { exercise: "pec-deck", name: "Pec deck", from: 130, to: 135 },
        ],
        stuck: [{ exercise: SHOULDER, name: "Seated dumbbell shoulder press", top: 45, lastSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 7 }], chase: [8, 8], drop: 40 }],
        nextWeekDeload: false,
      },
      waist: { now: 35.5, was: 35.75, wasDate: "2026-10-11", change: -0.25 },
      desserts: { offPlan: 3, allowance: 2 },
      feel: { hunger: null, energy: null, sleep: null, hungryTwice: false },
      call: {
        kind: "cut",
        ideal: 2150,
        goalLbPerWeek: expect.closeTo(1.0255, 3),
        guardrail: null,
        calories: { kcal: 2300, stepGoal: 7500 },
        steps: { kcal: 2400, stepGoal: 8000 },
        pick: "calories",
        maintenanceKcal: null,
        hungry: false,
        state: "settling",
        burn: 2680,
        // Week 3 plus the 3 updates left before the fourth.
        steadyBy: 6,
        trackedDays: 6,
        windowTrackedDays: 20,
        weighIns: 21,
        intakeAvg: 2400,
        holdReason: null,
        currentKcal: 2400,
        limits: { floor: 2000, fastLossLb: 2 },
      },
      meals: {
        repeats: [
          { slug: BOWL, name: "Chicken and rice bowl", count: 4, rest: true },
          { slug: THIGHS, name: "Honey-glazed chicken thighs", count: 3, rest: false },
        ],
        backFromRest: ["Steak and baked potato"],
      },
    });
  });

  it("follows the choices: taps, and the rest switches", () => {
    const d = buildDigest(rowsOf(weekThree()), "2026-10-19", { hunger: "fine", energy: "high", sleep: "poor", rest: [THIGHS] });
    expect(d.feel).toEqual({ hunger: "fine", energy: "high", sleep: "poor", hungryTwice: false });
    expect(d.meals.repeats.map((r) => r.rest)).toEqual([false, true]);
  });

  it("is hungry twice only after last week's High, and then picks steps", () => {
    const t = weekThree();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" })];
    const d = buildDigest(rowsOf(t), "2026-10-19", { ...NONE, hunger: "high" });
    expect(d.feel.hungryTwice).toBe(true);
    expect(d.call).toMatchObject({ pick: "steps", hungry: true });
    // A skipped check-in in between breaks the run.
    t.check_ins = [checkInRow("2026-10-05", { hunger: "high" })];
    expect(buildDigest(rowsOf(t), "2026-10-19", { ...NONE, hunger: "high" }).feel.hungryTwice).toBe(false);
  });

  it("names why a holding week holds", () => {
    // Week 2's 21-day window starts before the phase.
    expect(buildDigest(rowsOf(weekThree()), "2026-10-12", NONE).call).toMatchObject({ kind: "hold", state: "holding", holdReason: "first-weeks", steadyBy: null });
  });
});

describe("the guardrail's helpers", () => {
  it("collects every number, its tenth, and each list's length", () => {
    const n = digestNumbers(buildDigest(rowsOf(weekThree()), "2026-10-19", NONE));
    for (const x of [7443, 7000, 5900, 170, 0.4, 0.9, 0.25, 2680, 2300, 8000, 2, 3, 1]) expect(n.has(x), String(x)).toBe(true);
  });

  it("reads numbers from text, leaving out month-day dates", () => {
    expect(numbersIn("Waist is down 0.25 in since Oct 18.")).toEqual([0.25]);
    expect(numbersIn("Steps averaged 8,120, short of 8,500.")).toEqual([8120, 8500]);
  });
});

import { describe, expect, it } from "vitest";
import { COACH_NAME } from "~/brand";
import { buildDigest, digestNumbers, numbersIn, type CheckInDigest } from "~/checkin/digest";
import { ruleTake } from "~/checkin/take";
import { rowsOf, SHOULDER, weekThree } from "./fixture";

/** Week 4 (Oct 26 to Nov 1). Its win is "All 3 workouts done.", nothing to fix, and a settling cut. */
function base(): CheckInDigest {
  return {
    week: { monday: "2026-10-26", sunday: "2026-11-01", number: 4, weeksToCheckpoint: 9 },
    weight: { trend: 205.3, change: -0.3, sinceStart: -1.7, firstDate: "2026-10-05", firstWeight: 207 },
    days: { counted: 6, full: 5, tracked: 6, total: 7 },
    protein: { avg: 176, target: 180, lowDay: { date: "2026-10-29", grams: 150 } },
    steps: { avg: 8620, goal: 8500, lowDay: { date: "2026-10-31", steps: 6900 } },
    intake: { avg: 2310 },
    lifts: { planned: 3, plannedDone: 3, extras: [], missed: [], movedUp: [{ exercise: "pec-deck", name: "Pec deck", from: 130, to: 135 }], stuck: [], nextWeekDeload: false },
    waist: { now: null, was: 35.5, wasDate: "2026-10-18", change: null },
    desserts: { offPlan: 1, allowance: 2 },
    feel: { hunger: null, energy: null, sleep: null, hungryTwice: false },
    call: {
      kind: "cut",
      ideal: 2050,
      goalLbPerWeek: 1.0265,
      guardrail: null,
      calories: { kcal: 2300, stepGoal: 8500 },
      steps: { kcal: 2400, stepGoal: 9500 },
      pick: "calories",
      maintenanceKcal: null,
      hungry: false,
      state: "settling",
      burn: 2580,
      steadyBy: 5,
      trackedDays: 6,
      windowTrackedDays: 20,
      weighIns: 21,
      intakeAvg: 2310,
      holdReason: null,
      currentKcal: 2400,
      limits: { floor: 2000, fastLossLb: 2 },
    },
    meals: { repeats: [], backFromRest: [] },
  };
}

const make = (edit: (d: CheckInDigest) => void): CheckInDigest => {
  const d = base();
  edit(d);
  return d;
};
// Below the workouts win, so the later win rows can show.
const twoOfThree = (d: CheckInDigest) => (d.lifts.plannedDone = 2);
const shortSteps = (d: CheckInDigest) => (d.steps.avg = 8120);

const WINS: [string, CheckInDigest, string][] = [
  ["seven of seven with protein", make((d) => ((d.days.counted = 7), (d.protein.avg = 178))), "Seven of seven days counted, and protein averaged 178 g against 180."],
  [
    "two or more lifts moved up",
    make((d) => (d.lifts.movedUp = [d.lifts.movedUp[0], { exercise: "seated-cable-row", name: "Seated cable row", from: 110, to: 115 }, { exercise: "leg-extension", name: "Leg extension", from: 120, to: 130 }])),
    "Three lifts moved up. Pec deck goes to 135 lb.",
  ],
  ["every planned workout done", base(), "All 3 workouts done."],
  ["steps over goal", make(twoOfThree), "Steps averaged 8,620, over the 8,500 goal."],
  ["waist down", make((d) => (twoOfThree(d), shortSteps(d), (d.waist = { now: 35.25, was: 35.5, wasDate: "2026-10-18", change: -0.25 }))), "Waist is down 0.25 in since Oct 18."],
  ["trend down", make((d) => (twoOfThree(d), shortSteps(d), (d.weight.change = -0.4))), "Trend down 0.4 lb this week."],
  ["otherwise", make((d) => (twoOfThree(d), shortSteps(d), (d.weight.change = 0.2), (d.days.counted = 5))), "5 of 7 days counted."],
];

const FIXES: [string, CheckInDigest, string][] = [
  ["steps under goal", make((d) => ((d.steps = { avg: 8120, goal: 8500, lowDay: { date: "2026-10-31", steps: 5900 } }))), "Steps averaged 8,120, short of 8,500. Saturday was the low day at 5,900."],
  ["under 4 days closed out", make((d) => (d.days.tracked = 3)), "Only 3 days were closed out in full. Close out each night so the burn can update."],
  ["protein more than 10 g under", make((d) => (d.protein = { avg: 165, target: 180, lowDay: { date: "2026-10-29", grams: 120 } })), "Protein averaged 165 g against 180. Thursday was the low day at 120 g."],
  ["a workout missed", make((d) => (d.lifts.missed = ["2026-10-30"])), "Friday's workout was missed. Get the next one in."],
  ["two workouts missed", make((d) => (d.lifts.missed = ["2026-10-28", "2026-10-30"])), "2 workouts were missed. Get the next one in."],
  [
    "a stuck lift",
    make((d) => (d.lifts.stuck = [{ exercise: SHOULDER, name: "Seated dumbbell shoulder press", top: 45, lastSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 7 }], chase: [8, 8], drop: 40 }])),
    "Seated dumbbell shoulder press is stuck at 45 lb. Pick a plan for it below.",
  ],
  ["desserts over the allowance", make((d) => (d.desserts.offPlan = 3)), "3 off-plan desserts against the 2 allowed."],
  ["nothing", base(), "Nothing to fix. Run it back."],
];

const LEAD = "Trend down 0.3 lb.";
const CALLS: [string, CheckInDigest, string][] = [
  ["cut, pick calories", base(), `${LEAD} Burn is near 2,580, so calories go to 2,300 from Monday.`],
  [
    "cut, pick steps at half portions",
    make((d) => (d.call = { ...d.call, guardrail: "half-portions", pick: "steps", calories: { kcal: 2050, stepGoal: 8500 }, steps: { kcal: 2100, stepGoal: 9500 } })),
    `${LEAD} Food is at half portions, so ${COACH_NAME} picks 9,500 steps over less food.`,
  ],
  ["cut, pick steps when hungry", make((d) => (d.call = { ...d.call, pick: "steps", hungry: true })), `${LEAD} You were hungry two Sundays running, so ${COACH_NAME} picks 9,500 steps over less food.`],
  ["on pace while settling", make((d) => (d.call = { ...d.call, kind: "on-pace", calories: { kcal: 2300, stepGoal: 8500 }, steps: null })), `${LEAD} The burn estimate settles by week 5, so 2,300 holds one more week.`],
  ["on pace", make((d) => (d.call = { ...d.call, kind: "on-pace", state: "updating", steadyBy: null, steps: null })), `${LEAD} Right on pace, so 2,300 holds.`],
  ["raise", make((d) => (d.call = { ...d.call, kind: "raise", calories: { kcal: 2450, stepGoal: 8500 }, steps: null })), `${LEAD} Faster than 1 lb a week, so calories go up to 2,450.`],
  ["hold, few tracked days", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "week-days", trackedDays: 3, calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Only 3 days were tracked in full, so 2,400 holds one more week.`],
  ["hold, first two weeks", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "first-weeks", calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Two weeks of weigh-ins come first, so 2,400 holds.`],
  ["hold, a thin window", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "window-days", windowTrackedDays: 9, calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Only 9 days in the last three weeks were tracked in full, so 2,400 holds one more week.`],
  ["hold, few weigh-ins", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "weigh-ins", weighIns: 6, calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Only 6 weigh-ins in the last three weeks, so 2,400 holds one more week.`],
  ["hold, fast loss", make((d) => (d.call = { ...d.call, kind: "hold", guardrail: "fast-loss", calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} You lost over 2 lb two weeks running, so 2,400 holds.`],
  ["hold, floor", make((d) => (d.call = { ...d.call, kind: "hold", guardrail: "floor", calories: { kcal: 2000, stepGoal: 8500 }, steps: null })), `${LEAD} 2,000 is the floor, so it holds.`],
  ["hold, half portions at 10,000", make((d) => (d.call = { ...d.call, kind: "hold", guardrail: "half-portions", calories: { kcal: 2050, stepGoal: 10000 }, steps: null })), `${LEAD} Food is at half portions and steps are at 10,000, so 2,050 holds.`],
  ["maintenance next week", make((d) => (d.call = { ...d.call, kind: "maintenance", maintenanceKcal: 2600, steps: null })), `${LEAD} Maintenance week next: 2,600 a day, your burn.`],
];

describe("ruleTake", () => {
  it.each(WINS)("wins: %s", (_, d, line) => expect(ruleTake(d).win).toBe(line));
  it.each(FIXES)("fixes: %s", (_, d, line) => expect(ruleTake(d).fix).toBe(line));
  it.each(CALLS)("calls: %s", (_, d, line) => expect(ruleTake(d).call).toBe(line));

  it("leads the call with the trend: up, flat, or nothing without one", () => {
    expect(ruleTake(make((d) => (d.weight.change = 0.2))).call).toBe("Trend up 0.2 lb. Burn is near 2,580, so calories go to 2,300 from Monday.");
    expect(ruleTake(make((d) => (d.weight.change = 0))).call).toBe("Trend flat. Burn is near 2,580, so calories go to 2,300 from Monday.");
    expect(ruleTake(make((d) => (d.weight.change = null))).call).toBe("Burn is near 2,580, so calories go to 2,300 from Monday.");
  });

  it("says 1 and 0 days in words that read right", () => {
    expect(ruleTake(make((d) => (d.days.tracked = 1))).fix).toBe("Only 1 day was closed out in full. Close out each night so the burn can update.");
    expect(ruleTake(make((d) => (d.days.tracked = 0))).fix).toBe("No days were closed out in full. Close out each night so the burn can update.");
  });

  it("writes week 3's take from its rows", () => {
    expect(ruleTake(buildDigest(rowsOf(weekThree()), "2026-10-19", { hunger: null, energy: null, sleep: null, rest: null }))).toEqual({
      win: "Two lifts moved up. Incline dumbbell press goes to 55 lb.",
      fix: "Friday's workout was missed. Get the next one in.",
      call: "Trend down 0.4 lb. Burn is near 2,680, so calories go to 2,300 from Monday.",
    });
  });

  it("prints no number that isn't in the digest", () => {
    for (const [name, d] of [...WINS, ...FIXES, ...CALLS]) {
      const take = ruleTake(d);
      const known = digestNumbers(d);
      for (const line of [take.win, take.fix, take.call]) for (const n of numbersIn(line)) expect(known.has(n), `${name}: ${n} in "${line}"`).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { nextTarget, type BurnState, type CallInput, type EnergyWeek } from "~/domain/energy";

const week = (burn: number, state: BurnState): EnergyWeek => ({
  weekStart: "2026-10-19", burn, state, updates: 1, observed: null, intakeAvg: 2380, trackedDays: 7, windowTrackedDays: 21, weighIns: 21, trendStart: 206, trendEnd: 205.6,
});

function input(over: Partial<CallInput> = {}): CallInput {
  return { week: week(2680, "settling"), trendWeight: 205.6, currentKcal: 2400, stepGoal: 8500, baseStepGoal: 8500, changes: [-0.4, -0.5], maintenanceNext: false, halfPortionKcal: 2050, ...over };
}

describe("nextTarget", () => {
  it("cuts toward burn minus 0.5% a week, 100 at a time while settling, with walking as the other pick", () => {
    const call = nextTarget(input());
    expect(call).toMatchObject({ kind: "cut", ideal: 2150, pick: "calories", guardrail: null, calories: { kcal: 2300, stepGoal: 8500 }, steps: { kcal: 2400, stepGoal: 9500 } });
    expect(call.goalLbPerWeek).toBeCloseTo(1.028);
  });

  it("moves up to 150 once settled", () => {
    expect(nextTarget(input({ week: week(2690, "updating") })).calories.kcal).toBe(2250);
  });

  it("holds on pace, with no walking pick", () => {
    expect(nextTarget(input({ week: week(2914, "updating"), trendWeight: 200 }))).toMatchObject({ kind: "on-pace", calories: { kcal: 2400 }, steps: null });
  });

  it("raises toward the ideal when the burn is higher", () => {
    expect(nextTarget(input({ week: week(3100, "settling"), trendWeight: 200 }))).toMatchObject({ kind: "raise", calories: { kcal: 2500 }, steps: null });
  });

  it("never cuts after two weeks of losing more than 2 lb", () => {
    expect(nextTarget(input({ changes: [-2.2, -2.5] }))).toMatchObject({ kind: "hold", guardrail: "fast-loss", calories: { kcal: 2400 }, steps: null });
  });

  it("stops at the 2,000 floor", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2050, halfPortionKcal: 1500 }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "floor", calories: { kcal: 2000 } });
  });

  it("never sets the target above the burn, even past the weekly cap", () => {
    // Burn 2,250 at 200 lb: the ideal is 2,250 - 500 = 1,750. The settling move of 100 only reaches 2,300, over the burn.
    const call = nextTarget(input({ week: week(2250, "settling"), trendWeight: 200 }));
    expect(call).toMatchObject({ kind: "cut", ideal: 1750, guardrail: "no-surplus", pick: "calories", calories: { kcal: 2250, stepGoal: 8500 }, steps: { kcal: 2400, stepGoal: 9500 } });
  });

  it("lets no surplus outrank the fast-loss hold, which comes before it", () => {
    const call = nextTarget(input({ week: week(2250, "settling"), trendWeight: 200, changes: [-2.2, -2.5] }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "no-surplus", calories: { kcal: 2250 } });
  });

  it("offers walking as 1,000 more than this week's goal, not on top of the ramp", () => {
    // A met 7,000 goal ramps to 7,500 on the calories pick. Walking more offers 8,000, as v1 did.
    expect(nextTarget(input({ stepGoal: 7500, baseStepGoal: 7000 }))).toMatchObject({ calories: { kcal: 2300, stepGoal: 7500 }, steps: { kcal: 2400, stepGoal: 8000 } });
    expect(nextTarget(input({ stepGoal: 9500, baseStepGoal: 9500 })).steps).toEqual({ kcal: 2400, stepGoal: 10000 });
    // A met 9,500 goal ramps to 10,000: walking can't add more, so there is no walking pick.
    expect(nextTarget(input({ stepGoal: 10000, baseStepGoal: 9500 })).steps).toBeNull();
  });

  it("turns a cut past half portions into steps, and makes steps Rocky's pick", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2100 }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "half-portions", pick: "steps", calories: { kcal: 2050 }, steps: { kcal: 2100, stepGoal: 9500 } });
  });

  it("holds at half portions when steps are already at 10,000", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2050, stepGoal: 10000 }));
    expect(call).toMatchObject({ kind: "hold", guardrail: "half-portions", pick: "calories", calories: { kcal: 2050, stepGoal: 10000 }, steps: null });
  });

  it("holds while the burn is holding", () => {
    expect(nextTarget(input({ week: week(2800, "holding") }))).toMatchObject({ kind: "hold", ideal: null, calories: { kcal: 2400 }, steps: null });
  });

  it("eats at the burn in a maintenance week and keeps the base", () => {
    expect(nextTarget(input({ maintenanceNext: true }))).toMatchObject({ kind: "maintenance", maintenanceKcal: 2680, calories: { kcal: 2400 }, steps: null });
  });
});

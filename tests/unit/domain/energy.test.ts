import { describe, expect, it } from "vitest";
import { daysBetween } from "~/domain/dates";
import { energyHistory, type EnergyInput } from "~/domain/energy";

const PHASE = "2026-10-05";
const line = (d: string) => (d >= PHASE ? 210 - 0.05 * daysBetween(PHASE, d) : null);

function input(over: Partial<EnergyInput> = {}): EnergyInput {
  return { phaseStart: PHASE, through: "2026-10-19", priorBurn: 2800, intake: () => 2400, trend: line, weighedIn: (d) => d >= PHASE, ...over };
}

describe("energyHistory", () => {
  it("holds at the starting estimate until a full 21-day window exists", () => {
    const weeks = energyHistory(input());
    expect(weeks.map((w) => [w.weekStart, w.state, w.burn])).toEqual([
      ["2026-10-05", "holding", 2800],
      ["2026-10-12", "holding", 2800],
      ["2026-10-19", "settling", 2690],
    ]);
  });

  it("reads the burn from intake and the trend, moving halfway there", () => {
    const week3 = energyHistory(input()).at(-1)!;
    expect(week3.observed).toBeCloseTo(2575);
    expect(week3).toMatchObject({ intakeAvg: 2400, trackedDays: 7, windowTrackedDays: 21, weighIns: 21, updates: 1 });
    expect(week3.trendStart).toBeCloseTo(210);
    expect(week3.trendEnd).toBeCloseTo(209);
  });

  it("holds without 10 tracked days in the window, 4 in the week, or 8 weigh-ins", () => {
    const fewWindow = energyHistory(input({ intake: (d) => (d >= "2026-10-17" ? 2400 : null) })).at(-1)!;
    expect(fewWindow).toMatchObject({ state: "holding", burn: 2800, windowTrackedDays: 9 });
    const fewWeek = energyHistory(input({ intake: (d) => (d < "2026-10-19" || d >= "2026-10-23" ? 2400 : null) })).at(-1)!;
    expect(fewWeek).toMatchObject({ state: "holding", trackedDays: 3 });
    const fewWeighIns = energyHistory(input({ weighedIn: (d) => d >= "2026-10-19" && d <= "2026-10-25" })).at(-1)!;
    expect(fewWeighIns).toMatchObject({ state: "holding", weighIns: 7 });
  });

  it("moves the burn at most 250 a week", () => {
    expect(energyHistory(input({ intake: () => 4000 })).at(-1)!.burn).toBe(3050);
  });

  it("settles for four updates, then updates", () => {
    const weeks = energyHistory(input({ through: "2026-11-16" }));
    expect(weeks.map((w) => w.state)).toEqual(["holding", "holding", "settling", "settling", "settling", "settling", "updating"]);
    expect(weeks.at(-1)!.updates).toBe(5);
  });
});

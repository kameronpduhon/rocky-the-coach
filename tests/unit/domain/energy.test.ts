import { describe, expect, it } from "vitest";
import { daysBetween } from "~/domain/dates";
import { energyHistory, type EnergyInput } from "~/domain/energy";

const PHASE = "2026-10-05";
// The trend: 210 on Sunday Oct 4, the day before the phase, falling 1.0 lb every 21 days. 209 on Sunday Oct 25.
const line = (d: string) => (d >= "2026-10-04" ? 210 - daysBetween("2026-10-04", d) / 21 : null);

function input(over: Partial<EnergyInput> = {}): EnergyInput {
  return { phaseStart: PHASE, through: "2026-10-19", priorBurn: 2800, intake: () => 2400, trend: line, weighedIn: (d) => d >= PHASE, ...over };
}

describe("energyHistory", () => {
  it("holds at the starting estimate until a full 21-day window exists", () => {
    const weeks = energyHistory(input());
    expect(weeks.map((w) => [w.weekStart, w.state, w.burn])).toEqual([
      ["2026-10-05", "holding", 2800],
      ["2026-10-12", "holding", 2800],
      ["2026-10-19", "settling", 2680],
    ]);
  });

  it("reads the burn from intake and the trend the day before the window, over 21 days (the spec's worked example)", () => {
    const week3 = energyHistory(input()).at(-1)!;
    // 2,400 + 3,500 x (210 - 209) / 21 = 2,566.7. Halfway from 2,800: 2,683.3, to 2,680.
    expect(week3.observed).toBeCloseTo(2566.67);
    expect(week3).toMatchObject({ burn: 2680, intakeAvg: 2400, trackedDays: 7, windowTrackedDays: 21, weighIns: 21, updates: 1 });
    expect(week3.trendStart).toBeCloseTo(210);
    expect(week3.trendEnd).toBeCloseTo(209);
  });

  it("holds when there is no trend the day before the window", () => {
    const week3 = energyHistory(input({ trend: (d) => (d >= PHASE ? 210 : null) })).at(-1)!;
    expect(week3).toMatchObject({ state: "holding", burn: 2800, trendStart: null });
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

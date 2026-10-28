import { describe, expect, it } from "vitest";
import { dropWeight, stuckLifts, type LiftHistory, type LiftSession } from "~/domain/stalls";

const sets = (...pairs: [number, number][]) => pairs.map(([weight, reps]) => ({ weight, reps }));
const at = (date: string, s: [number, number][], deload = false): LiftSession => ({ date, sets: sets(...s), deload });

// Seated dumbbell shoulder press, 6 to 10 reps, 5 lb steps, on three Wednesdays. Week 3 runs Oct 19 to 25.
function shoulder(sessions: LiftSession[], over: Partial<LiftHistory> = {}): LiftHistory {
  return { exercise: "seated-dumbbell-shoulder-press", increment: 5, bodyWeight: false, repMax: 10, sessions, ...over };
}
const EIGHT_SEVEN: [number, number][] = [
  [45, 8],
  [45, 7],
];

describe("dropWeight", () => {
  it("drops about 10%, to the increment, at least one step and never below one", () => {
    expect(dropWeight(45, 5)).toBe(40);
    // 13.5 rounds to 15, which is no drop, so it goes one step down.
    expect(dropWeight(15, 5)).toBe(10);
    expect(dropWeight(10, 5)).toBe(5);
    expect(dropWeight(5, 5)).toBe(5);
    // 117 rounds to 120 at 10 lb steps.
    expect(dropWeight(130, 10)).toBe(120);
  });
});

describe("stuckLifts", () => {
  it("finds a lift at the same weight and reps three sessions running", () => {
    const lift = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([lift], "2026-10-19", "2026-10-25", 2)).toEqual([
      { exercise: "seated-dumbbell-shoulder-press", top: 45, lastSets: sets(...EIGHT_SEVEN), chase: [8, 8], drop: 40 },
    ]);
  });

  it("counts falling reps as stuck, and rising reps or a heavier session as moving", () => {
    // 16, then 15, then 14 reps in all: no more than the first.
    const falling = shoulder([at("2026-10-07", [[45, 8], [45, 8]]), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", [[45, 7], [45, 7]])]);
    expect(stuckLifts([falling], "2026-10-19", "2026-10-25", 2)).toHaveLength(1);
    // 15, then 16: the second beat the first.
    const rising = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", [[45, 8], [45, 8]]), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([rising], "2026-10-19", "2026-10-25", 2)).toEqual([]);
    const heavier = shoulder([at("2026-10-07", [[40, 8], [40, 7]]), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([heavier], "2026-10-19", "2026-10-25", 2)).toEqual([]);
  });

  it("skips a deload week's session when finding the three", () => {
    // Week 8 (Nov 23 to 29) is the deload. Reviewing week 9 (Nov 30 to Dec 6): Nov 11, Nov 18 and Dec 2 are the run.
    const lift = shoulder([at("2026-11-11", EIGHT_SEVEN), at("2026-11-18", EIGHT_SEVEN), at("2026-11-25", [[45, 9]], true), at("2026-12-02", EIGHT_SEVEN)]);
    expect(stuckLifts([lift], "2026-11-30", "2026-12-06", 2)).toHaveLength(1);
  });

  it("shows nothing when the third session is outside the week under review", () => {
    const lift = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([lift], "2026-10-26", "2026-11-01", 2)).toEqual([]);
  });

  it("never calls a lift stuck when it hit the top, or when it is body weight", () => {
    const top: [number, number][] = [
      [45, 10],
      [45, 10],
    ];
    expect(stuckLifts([shoulder([at("2026-10-07", top), at("2026-10-14", top), at("2026-10-21", top)])], "2026-10-19", "2026-10-25", 2)).toEqual([]);
    const pullUps = shoulder([at("2026-10-07", [[0, 8], [0, 7]]), at("2026-10-14", [[0, 8], [0, 7]]), at("2026-10-21", [[0, 8], [0, 7]])], { exercise: "pull-up", bodyWeight: true, repMax: 12 });
    expect(stuckLifts([pullUps], "2026-10-19", "2026-10-25", 2)).toEqual([]);
  });

  it("chases the best set's reps once per set next week", () => {
    // The best set is the heaviest, then the most reps at it: 8, even when it came second.
    const lift = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", [[45, 7], [45, 8]])]);
    expect(stuckLifts([lift], "2026-10-19", "2026-10-25", 2)[0].chase).toEqual([8, 8]);
    expect(stuckLifts([lift], "2026-10-19", "2026-10-25", 1)[0].chase).toEqual([8]);
  });
});

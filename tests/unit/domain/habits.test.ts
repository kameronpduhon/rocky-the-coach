import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { countedDay, dessertAllowance, fullDay, habitStreak, overAllowanceDates, type DayActivity } from "~/domain/habits";

const none: DayActivity = { weighIn: false, mealLogged: false, workout: false, steps: 0, relaxed: false };
const today = "2026-10-28";

/** A streak over days counted by offset from today: 0 is today, 1 is yesterday. */
const streakOf = (countedOffsets: number[], span = 30) =>
  habitStreak((d) => countedOffsets.some((o) => addDays(today, -o) === d), today, addDays(today, -span));

describe("countedDay", () => {
  it("counts any one action", () => {
    expect(countedDay(none)).toBe(false);
    expect(countedDay({ ...none, weighIn: true })).toBe(true);
    expect(countedDay({ ...none, mealLogged: true })).toBe(true);
    expect(countedDay({ ...none, workout: true })).toBe(true);
    expect(countedDay({ ...none, steps: 2999 })).toBe(false);
    expect(countedDay({ ...none, steps: 3000 })).toBe(true);
  });

  it("always counts a relaxed day", () => {
    expect(countedDay({ ...none, relaxed: true })).toBe(true);
  });
});

describe("habitStreak", () => {
  it("counts consecutive days", () => {
    expect(streakOf([0, 1, 2, 3, 4])).toBe(5);
  });

  it("steps over a single uncounted day", () => {
    expect(streakOf([0, 1, 3, 4])).toBe(4);
  });

  it("ends at two uncounted days in a row", () => {
    expect(streakOf([0, 1, 4, 5])).toBe(2);
  });

  it("never breaks on today while today is in progress", () => {
    expect(streakOf([1, 2])).toBe(2);
    expect(streakOf([2, 3])).toBe(2);
  });

  it("stops at the first day there is data for", () => {
    expect(habitStreak(() => true, today, addDays(today, -2))).toBe(3);
  });
});

describe("dessert allowance", () => {
  it("shows what is left, then the count in the same words", () => {
    expect(dessertAllowance(0)).toBe("2 of 2 left this week");
    expect(dessertAllowance(2)).toBe("0 of 2 left this week");
    expect(dessertAllowance(3)).toBe("3 this week");
  });

  it("marks only the days past the week's two, and resets on Monday", () => {
    const desserts = [
      { date: "2026-10-26", at: "2026-10-27T01:00:00Z" },
      { date: "2026-10-27", at: "2026-10-28T01:00:00Z" },
      { date: "2026-10-28", at: "2026-10-29T01:00:00Z" },
      { date: "2026-11-02", at: "2026-11-03T01:00:00Z" },
    ];
    expect([...overAllowanceDates(desserts)]).toEqual(["2026-10-28"]);
  });
});

describe("fullDay", () => {
  const good = { proteinG: 185, proteinTarget: 180, steps: 8600, stepGoal: 8500, relaxedDay: false, overAllowance: false };
  it("needs protein, steps and no dessert past the allowance", () => {
    expect(fullDay(good)).toBe(true);
    expect(fullDay({ ...good, proteinG: 150 })).toBe(false);
    expect(fullDay({ ...good, steps: 8000 })).toBe(false);
    expect(fullDay({ ...good, overAllowance: true })).toBe(false);
  });
  it("is always full on a relaxed day", () => {
    expect(fullDay({ ...good, proteinG: 0, steps: 0, overAllowance: true, relaxedDay: true })).toBe(true);
  });
});

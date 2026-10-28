import { describe, expect, it } from "vitest";
import { backFromRest, defaultRests, groceryCount, lastEatenBefore, mealRepeats, previewNextWeek, restUntil } from "~/checkin/meals";
import { BOWL, checkInRow, rowsOf, THIGHS, weekThree } from "./fixture";

const rows = rowsOf(weekThree());

describe("meal repeats", () => {
  it("lists planned meals eaten 3 or more times, most first, and rests 4 or more by default", () => {
    const repeats = mealRepeats(rows, "2026-10-19");
    expect(repeats).toEqual([
      { slug: BOWL, name: "Chicken and rice bowl", count: 4 },
      { slug: THIGHS, name: "Honey-glazed chicken thighs", count: 3 },
    ]);
    expect(defaultRests(repeats)).toEqual([BOWL]);
  });

  it("rests two full weeks from next Monday", () => {
    // Oct 26 + 13 days.
    expect(restUntil("2026-10-19")).toBe("2026-11-08");
  });

  it("names meals back from rest by next Monday", () => {
    // Steak rested until Oct 21 is back; salmon until Nov 3 still rests; burger bowl came back before this week.
    expect(backFromRest(rows, "2026-10-19")).toEqual(["Steak and baked potato"]);
    expect(backFromRest(rows, "2026-10-12")).toEqual(["Burger bowl"]);
  });
});

describe("next week's preview", () => {
  it("keeps the latest day each meal was eaten", () => {
    expect(lastEatenBefore(rows, "2026-10-26")).toEqual({ [BOWL]: "2026-10-22", [THIGHS]: "2026-10-23" });
    expect(lastEatenBefore(rows, "2026-10-21")).toEqual({ [BOWL]: "2026-10-20", [THIGHS]: "2026-10-19" });
  });

  it("plans 35 slots without the switched-on rests or meals still resting", () => {
    const week = previewNextWeek(rows, "2026-10-19", [BOWL]);
    expect(week).toHaveLength(35);
    expect(week[0].date).toBe("2026-10-26");
    expect(week.at(-1)!.date).toBe("2026-11-01");
    expect(week.some((p) => p.slug === BOWL || p.slug === "salmon-and-rice")).toBe(false);
  });

  it("on a redo, drops a rest this week's finish set once its switch is off, as Finish will", () => {
    const fresh = previewNextWeek(rows, "2026-10-19", []);
    expect(fresh.some((p) => p.slug === BOWL)).toBe(true);
    const t = weekThree();
    t.check_ins = [checkInRow("2026-10-19", { outcome: JSON.stringify({ rest: [BOWL] }) })];
    t.meal_state = [...t.meal_state, { slug: BOWL, photo_key: null, rested_until: restUntil("2026-10-19") }];
    const redo = rowsOf(t);
    expect(previewNextWeek(redo, "2026-10-19", [])).toEqual(fresh);
    expect(previewNextWeek(redo, "2026-10-19", [BOWL]).some((p) => p.slug === BOWL)).toBe(false);
    // A rest to the same day that this week's finish didn't set stays, as Finish leaves it.
    t.check_ins = [checkInRow("2026-10-19")];
    expect(previewNextWeek(rowsOf(t), "2026-10-19", []).some((p) => p.slug === BOWL)).toBe(false);
  });

  it("counts a week's foods as the grocery list does", () => {
    // Chicken, rice, butter and pineapple, however many times the bowl comes up.
    expect(groceryCount([BOWL])).toBe(4);
    expect(groceryCount([BOWL, BOWL])).toBe(4);
    expect(groceryCount([])).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { weekGroceries, type GroceriesModel } from "~/groceries/model";
import type { Row } from "~/sync/tables";

const MON = "2026-10-26";
const WED = "2026-10-28";
const NEXT = "2026-11-02";
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const DAY = { breakfast: "steak-and-eggs", lunch: "chicken-and-rice-bowl", snack: "greek-yogurt-and-berries", dinner: "honey-glazed-chicken-thighs", dessert: "protein-ice-cream" };
const week = (monday: string): Row[] =>
  Array.from({ length: 7 }, (_, i) => addDays(monday, i)).flatMap((date) => Object.entries(DAY).map(([slot, meal_slug]) => ({ date, slot, meal_slug, swapped: 0 })));
// Sunday's check-in trimmed 100 cal a day from Monday Oct 26.
const trimmed: Row[] = [{ effective_from: MON, kcal: 2300, protein_g: 180, step_goal: 8500 }];
const item = (m: GroceriesModel, food: string) => m.sections.flatMap((s) => s.rows).find((r) => r.food === food);
// This week steak and eggs was eaten 4 times and the bowl 3, so only steak and eggs rests by default.
const eaten: Row[] = [
  ...[0, 1, 2, 3].map((i) => ({ client_id: `b-${i}`, date: addDays(MON, i), slot: "breakfast", meal_slug: "steak-and-eggs", category: "planned", kcal: 525, protein_g: 58 })),
  ...[0, 1, 2].map((i) => ({ client_id: `l-${i}`, date: addDays(MON, i), slot: "lunch", meal_slug: "chicken-and-rice-bowl", category: "planned", kcal: 605, protein_g: 55 })),
];
const thisWeek = rowsOf({ planned_meals: week(MON), targets: trimmed, meal_logs: eaten });

describe("weekGroceries", () => {
  it("sums a planned week by aisle at that week's grams, with that week's checks", () => {
    const checks: Row[] = [
      { week_start: MON, food_id: "egg-whole" },
      { week_start: MON, food_id: "white-rice-cooked" },
      { week_start: "2026-10-19", food_id: "butter" },
    ];
    const m = weekGroceries(rowsOf({ planned_meals: week(MON), targets: trimmed, grocery_checks: checks }), WED);
    expect(m).toMatchObject({ monday: MON, header: "WEEK OF OCT 26", preview: false, kcal: 2300, count: 15, checked: 2 });
    expect(m.sections.map((s) => [s.label, s.done, s.rows.length])).toEqual([
      ["Meat and seafood", 0, 3],
      ["Dairy and eggs", 1, 5],
      ["Produce", 0, 4],
      ["Pantry", 1, 3],
    ]);
    // The bowl and the thighs carry 175 g of cooked rice each at 2,300: 14 x 175 = 2,450.
    expect(item(m, "white-rice-cooked")).toEqual({ food: "white-rice-cooked", name: "White rice", sub: "Cooked weight", grams: 2450, checked: true });
    // An egg is 50 g, so 700 g is about 14.
    expect(item(m, "egg-whole")).toEqual({ food: "egg-whole", name: "Eggs", sub: "About 14 eggs", grams: 700, checked: true });
    // Last week's butter check doesn't carry over.
    expect(item(m, "butter")).toMatchObject({ grams: 90, checked: false });
  });

  it("moves only the flex foods with the target", () => {
    const full = weekGroceries(rowsOf({ planned_meals: week(MON) }), WED);
    const cut = weekGroceries(rowsOf({ planned_meals: week(MON), targets: trimmed }), WED);
    expect(full.kcal).toBe(2400);
    expect(["white-rice-cooked", "butter", "honey"].map((f) => [item(full, f)!.grams, item(cut, f)!.grams])).toEqual([
      [2800, 2450],
      [105, 90],
      [175, 155],
    ]);
    for (const f of ["chicken-breast-raw", "chicken-thigh-raw", "sirloin-raw"]) expect(item(cut, f)!.grams, f).toBe(item(full, f)!.grams);
  });

  it("previews a future week from the rotation, resting what the check-in rests by default", () => {
    const m = weekGroceries(thisWeek, WED, { week: NEXT });
    expect(m).toMatchObject({ monday: NEXT, header: "WEEK OF NOV 2", preview: true, kcal: 2300, count: 37, checked: 0 });
    // Steak and eggs rests, so there is less sirloin than with nothing resting.
    expect(item(m, "sirloin-raw")!.grams).toBe(600);
    expect(item(weekGroceries(thisWeek, WED, { week: NEXT, rest: [], kcal: "2300" }), "sirloin-raw")!.grams).toBe(750);
  });

  it("takes the check-in's rests and calories", () => {
    const m = weekGroceries(thisWeek, WED, { week: NEXT, rest: ["chicken-and-rice-bowl"], kcal: "2200" });
    expect(m.kcal).toBe(2200);
    expect(item(m, "chicken-breast-raw")!.grams).toBe(200);
    expect(item(m, "white-rice-cooked")!.grams).toBe(1000);
  });

  it("weighs a planned week at its own target, and ignores calories that make no sense", () => {
    expect(weekGroceries(thisWeek, WED, { week: MON, kcal: "1800" }).kcal).toBe(2300);
    expect(weekGroceries(thisWeek, WED, { week: NEXT, kcal: "lots" }).kcal).toBe(2300);
  });

  it("builds a past week with no plan from the rotation, without the preview note", () => {
    expect(weekGroceries(rowsOf({}), WED, { week: "2026-10-19" })).toMatchObject({ monday: "2026-10-19", preview: false, kcal: 2400, count: 37 });
  });
});

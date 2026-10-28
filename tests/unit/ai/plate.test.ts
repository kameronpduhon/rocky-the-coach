import { describe, expect, it } from "vitest";
import type { FoodTableEntry } from "~/content/schema";
import { addFood, addOil, pickFood, plateTotal, rowNumbers, setGrams, startPlate, stepDown, stepUp, typeNumbers, uncountedNote, type PlateRow } from "~/ai/plate";

const food = (id: string, name: string, group: FoodTableEntry["group"], kcalPer100: number, proteinPer100: number, firstG = 100): FoodTableEntry => ({
  id,
  name,
  aliases: [],
  group,
  fdcId: 1,
  source: "sr-legacy",
  kcalPer100,
  proteinPer100,
  portions: [{ label: "1 portion", g: firstG }],
});
const FOODS = new Map(
  [
    food("chicken-thigh-cooked", "Chicken thigh, grilled", "protein", 179, 24.8),
    food("white-rice-cooked", "White rice, cooked", "starch", 130, 2.69),
    food("black-beans-cooked", "Black beans", "beans", 132, 8.86),
    food("fajita-veg", "Fajita vegetables", "vegetable", 59, 1.04),
    food("salsa", "Tomato salsa", "sauce", 34, 1.44),
    food("guacamole", "Guacamole", "sauce", 155, 1.95),
    food("cooking-oil", "Cooking oil", "fat-oil", 884, 0),
    food("cola", "Cola", "drink", 42, 0, 368),
  ].map((f) => [f.id, f]),
);

const BOWL = [
  { label: "Double chicken", foodId: "chicken-thigh-cooked", grams: 226 },
  { label: "White rice", foodId: "white-rice-cooked", grams: 150 },
  { label: "Black beans", foodId: null, grams: 120 },
  { label: "Fajita veg", foodId: "fajita-veg", grams: 70 },
  { label: "Salsa", foodId: "salsa", grams: 110 },
  { label: "Guac", foodId: "guacamole", grams: 110 },
];
const start = () => startPlate(BOWL, FOODS);
const beans = (rows: PlateRow[]) => rows.find((r) => r.label === "Black beans")!;

describe("row math", () => {
  it("rounds a matched row's calories to 5 and protein to 1 g", () => {
    const rows = start();
    expect(rows.map((r) => rowNumbers(r, FOODS))).toEqual([
      { kcal: 405, protein: 56 },
      { kcal: 195, protein: 4 },
      null,
      { kcal: 40, protein: 1 },
      { kcal: 35, protein: 2 },
      { kcal: 170, protein: 2 },
    ]);
  });

  it("totals the rows as shown, leaving out the row with no numbers", () => {
    expect(plateTotal(start(), FOODS)).toEqual({ kcal: 845, protein: 65 });
  });

  it("counts a row at 0 g as 0", () => {
    const rows = setGrams(start(), start()[0]!.key, 0);
    expect(rowNumbers(rows[0]!, FOODS)).toEqual({ kcal: 0, protein: 0 });
    expect(plateTotal(rows, FOODS)).toEqual({ kcal: 440, protein: 9 });
  });
});

describe("startPlate", () => {
  it("keeps 12 items, clamps grams to whole numbers from 1 to 2,000, and unmatches an unknown id", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ label: `Food ${i}`, foodId: "white-rice-cooked", grams: 100 }));
    items[0] = { label: "Huge", foodId: "white-rice-cooked", grams: 2500 };
    items[1] = { label: "Crumb", foodId: "white-rice-cooked", grams: 0.4 };
    items[2] = { label: "Made up", foodId: "not-a-food", grams: 80.6 };
    const rows = startPlate(items, FOODS);
    expect(rows).toHaveLength(12);
    expect(rows.slice(0, 3).map((r) => [r.foodId, r.grams])).toEqual([
      ["white-rice-cooked", 2000],
      ["white-rice-cooked", 1],
      [null, 81],
    ]);
  });
});

describe("typed numbers on an unmatched row", () => {
  it("count as typed for the grams shown, and scale when the grams change", () => {
    let rows = typeNumbers(start(), beans(start()).key, { kcal: 150, protein: 9 });
    expect(rowNumbers(beans(rows), FOODS)).toEqual({ kcal: 150, protein: 9 });
    expect(plateTotal(rows, FOODS)).toEqual({ kcal: 995, protein: 74 });
    rows = setGrams(rows, beans(rows).key, stepUp(beans(rows).grams));
    expect(beans(rows).grams).toBe(130);
    expect(rowNumbers(beans(rows), FOODS)).toEqual({ kcal: 165, protein: 10 });
    expect(plateTotal(rows, FOODS)).toEqual({ kcal: 1010, protein: 75 });
  });

  it("need calories to count; protein left empty is 0", () => {
    expect(rowNumbers(beans(typeNumbers(start(), beans(start()).key, { kcal: null, protein: 9 })), FOODS)).toBeNull();
    expect(rowNumbers(beans(typeNumbers(start(), beans(start()).key, { kcal: 150, protein: null })), FOODS)).toEqual({ kcal: 150, protein: 0 });
  });
});

describe("uncountedNote", () => {
  it("names one food, counts two or more, and says nothing when all count", () => {
    expect(uncountedNote(start(), FOODS)).toBe("Black beans isn't counted until it has numbers.");
    const two = startPlate([...BOWL, { label: "Queso", foodId: null, grams: 60 }], FOODS);
    expect(uncountedNote(two, FOODS)).toBe("2 foods aren't counted until they have numbers.");
    expect(uncountedNote(typeNumbers(start(), beans(start()).key, { kcal: 150, protein: 9 }), FOODS)).toBeNull();
  });

  it("leaves out a row stepped down to 0 g", () => {
    expect(uncountedNote(setGrams(start(), beans(start()).key, 0), FOODS)).toBeNull();
  });
});

describe("the stepper", () => {
  it("moves 5 g at 50 g and under and 10 g above, from 0 to 2,000", () => {
    expect([stepUp(0), stepUp(45), stepUp(50), stepUp(226), stepUp(1995), stepUp(2000)]).toEqual([5, 50, 60, 236, 2000, 2000]);
    expect([stepDown(50), stepDown(5), stepDown(3), stepDown(0), stepDown(226), stepDown(55)]).toEqual([45, 0, 0, 0, 216, 45]);
  });
});

describe("adding foods", () => {
  it("+ oil adds 10 g of cooking oil, and 10 g more to the same row the second time", () => {
    const once = addOil(start(), FOODS);
    const twice = addOil(once, FOODS);
    const oil = twice.filter((r) => r.foodId === "cooking-oil");
    expect(oil).toHaveLength(1);
    expect(oil[0]!.grams).toBe(20);
    expect(rowNumbers(oil[0]!, FOODS)).toEqual({ kcal: 175, protein: 0 });
  });

  it("a picked drink starts at its first portion", () => {
    const rows = addFood(start(), FOODS.get("cola")!);
    expect(rows.at(-1)).toMatchObject({ foodId: "cola", label: "Cola", grams: 368, typed: null });
    expect(rowNumbers(rows.at(-1)!, FOODS)).toEqual({ kcal: 155, protein: 0 });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("Pick a food replaces an unmatched row at the same grams, and it counts", () => {
    const typed = typeNumbers(start(), beans(start()).key, { kcal: 150, protein: 9 });
    const rows = pickFood(typed, beans(typed).key, FOODS.get("black-beans-cooked")!);
    expect(rows[2]).toMatchObject({ foodId: "black-beans-cooked", label: "Black beans", grams: 120, typed: null });
    expect(rowNumbers(rows[2]!, FOODS)).toEqual({ kcal: 160, protein: 11 });
    expect(plateTotal(rows, FOODS)).toEqual({ kcal: 1005, protein: 76 });
  });
});

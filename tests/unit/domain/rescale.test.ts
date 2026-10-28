import { describe, expect, it } from "vitest";
import { flexKcalPerDay, halfPortionKcal, rescaleFactor, scaleIngredient } from "~/domain/rescale";

const rice = { grams: 200, kcalPer100: 130, role: "flex" as const };
const chicken = { grams: 220, kcalPer100: 120, role: "protein" as const };

describe("flexKcalPerDay", () => {
  it("averages each slot's pool at recipe grams and adds the five slots, so main counts twice", () => {
    const meals = [
      { pool: "main" as const, ingredients: [chicken, rice] },
      { pool: "main" as const, ingredients: [chicken] },
      { pool: "breakfast" as const, ingredients: [{ grams: 10, kcalPer100: 700, role: "flex" as const }] },
    ];
    // breakfast 70 + lunch 130 + snack 0 + dinner 130 + dessert 0
    expect(flexKcalPerDay(meals)).toBeCloseTo(330);
  });
});

describe("rescaleFactor", () => {
  it("is 1 at the target the meals were written for", () => {
    expect(rescaleFactor(2400, 2400, 750)).toBe(1);
  });

  it("moves flex foods by the calorie change over the flex calories", () => {
    expect(rescaleFactor(2300, 2400, 750)).toBeCloseTo(1 - 100 / 750);
    expect(rescaleFactor(2600, 2400, 750)).toBeCloseTo(1 + 200 / 750);
  });

  it("stops at half and one and a half portions", () => {
    expect(rescaleFactor(1500, 2400, 750)).toBe(0.5);
    expect(rescaleFactor(3500, 2400, 750)).toBe(1.5);
  });
});

describe("halfPortionKcal", () => {
  it("is the target at half portions, rounded up to 50", () => {
    expect(halfPortionKcal(2400, 750)).toBe(2050);
  });
});

describe("scaleIngredient", () => {
  it("scales flex grams with portion rounding and leaves the rest", () => {
    const f = 1 - 100 / 750;
    expect(scaleIngredient(200, "flex", f)).toBe(175);
    expect(scaleIngredient(10, "flex", f)).toBe(9);
    expect(scaleIngredient(220, "protein", f)).toBe(220);
    expect(scaleIngredient(100, "fixed", f)).toBe(100);
    expect(scaleIngredient(22, "flex", 1)).toBe(22);
  });
});

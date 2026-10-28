import { describe, expect, it } from "vitest";
import { foods, meals } from "~/content";
import { FLEX_KCAL_PER_DAY, HALF_PORTION_KCAL, factorFor, scaledMeal } from "~/content/scaled";

describe("scaled meals", () => {
  it("leaves every meal as written at 2,400", () => {
    expect(factorFor(2400)).toBe(1);
    for (const meal of meals.values()) expect(scaledMeal(meal, factorFor(2400))).toBe(meal);
  });

  it("averages about 750 flex calories a day, so half portions sit at 2,050", () => {
    expect(FLEX_KCAL_PER_DAY).toBeGreaterThan(700);
    expect(FLEX_KCAL_PER_DAY).toBeLessThan(800);
    expect(HALF_PORTION_KCAL).toBe(2050);
  });

  it("trims rice and butter but not chicken at 2,300, and recounts the meal", () => {
    const m = scaledMeal(meals.get("chicken-and-rice-bowl")!, factorFor(2300));
    expect(m.ingredients.map((i) => [i.food, i.grams])).toEqual([
      ["chicken-breast-raw", 220],
      ["white-rice-cooked", 175],
      ["butter", 9],
      ["pineapple", 100],
    ]);
    expect(m).toMatchObject({ kcal: 605, protein: 55 });
  });

  it("never changes a protein or fixed food, at any factor", () => {
    for (const factor of [0.5, 0.87, 1.5]) {
      for (const meal of meals.values()) {
        scaledMeal(meal, factor).ingredients.forEach((i, n) => {
          if (foods.get(i.food)!.role !== "flex") expect(i.grams, `${meal.slug} ${i.food}`).toBe(meal.ingredients[n].grams);
        });
      }
    }
  });
});

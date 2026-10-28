import { describe, expect, it } from "vitest";
import { FOOD_BY_ID, foodPromptBlock, isFoodId, searchFoods } from "~/ai/food-table";

const ids = (query: string, group: Parameters<typeof searchFoods>[1] = null) => searchFoods(query, group).flatMap((s) => s.foods.map((f) => f.id));

describe("lookups", () => {
  it("knows the table's ids and nothing else", () => {
    expect(isFoodId("black-beans-cooked")).toBe(true);
    expect(isFoodId("coconut-aminos")).toBe(false);
    expect(isFoodId("")).toBe(false);
    expect(FOOD_BY_ID.get("cooking-oil")?.kcalPer100).toBe(884);
  });
});

describe("searchFoods", () => {
  it("matches names and aliases, every word, any case", () => {
    expect(ids("guac")).toEqual(["guacamole"]);
    expect(ids("black bean")).toEqual(["black-beans-cooked", "black-bean-soup"]);
    expect(ids("COKE")).toEqual(["cola", "diet-cola", "rum-and-cola"]);
  });

  it("groups results in the table's group order, with each group's heading", () => {
    const sections = searchFoods("chicken burrito", null);
    expect(sections.map((s) => [s.group, s.label])).toEqual([["fast-food", "Restaurant and fast food"]]);
  });

  it("starts filtered to a group when a chip opens it", () => {
    const drinks = searchFoods("", "drink");
    expect(drinks.map((s) => s.group)).toEqual(["drink"]);
    expect(drinks[0]!.foods[0]!.id).toBe("water");
    expect(ids("ranch", "sauce")).toEqual(["ranch"]);
    expect(ids("ranch", "drink")).toEqual([]);
  });
});

describe("foodPromptBlock", () => {
  const block = foodPromptBlock();

  it("lists every food as id | name | aliases | portions", () => {
    const lines = block.split("\n");
    expect(lines[0]).toBe("Food table. One food per line: id | name | other names | common portions.");
    expect(lines).toHaveLength(335);
    expect(lines).toContain("black-beans-cooked | Black beans | black beans, frijoles negros | 0.5 cup 86 g, 1 restaurant scoop 113 g");
    expect(lines).toContain("cooking-oil | Cooking oil | oil, vegetable oil, canola oil | 1 tsp 4.5 g, 1 tbsp 14 g");
  });

  it("never carries a number per 100 g, so the model has none to repeat", () => {
    for (const line of block.split("\n").slice(1)) expect(line.split(" | ")).toHaveLength(4);
    expect(block).not.toContain("per 100");
    expect(block).not.toContain("884");
  });
});

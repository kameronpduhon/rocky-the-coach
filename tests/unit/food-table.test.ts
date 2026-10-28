import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FOOD_GROUPS, FoodTableEntrySchema, FoodTableSourceSchema } from "~/content/schema";
import foodsJson from "../../content/foods.json";

const read = (file: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, "../../content", file), "utf8"));
const table = FoodTableEntrySchema.array().parse(read("food-table.json"));
const source = FoodTableSourceSchema.array().parse(read("food-table.source.json"));

describe("the food table", () => {
  it("is the source list, in order, with numbers filled in", () => {
    expect(table.map((f) => f.id)).toEqual(source.map((s) => s.id));
    expect(table).toHaveLength(334);
  });

  it("gives every food a unique id, a known group, an fdcId and at least one portion", () => {
    expect(new Set(table.map((f) => f.id)).size).toBe(table.length);
    for (const f of table) {
      expect(FOOD_GROUPS, f.id).toContain(f.group);
      expect(f.fdcId, f.id).toBeGreaterThan(0);
      expect(f.portions.length, f.id).toBeGreaterThan(0);
    }
  });

  it("keeps calories 0 to 900 and protein 0 to 100 per 100 g, with protein × 4 no more than calories × 1.1", () => {
    for (const f of table) {
      expect(f.kcalPer100, f.id).toBeGreaterThanOrEqual(0);
      expect(f.kcalPer100, f.id).toBeLessThanOrEqual(900);
      expect(f.proteinPer100, f.id).toBeLessThanOrEqual(100);
      expect(f.proteinPer100 * 4, f.id).toBeLessThanOrEqual(f.kcalPer100 * 1.1);
    }
  });

  it("has at least ten foods in every group", () => {
    for (const g of FOOD_GROUPS) expect(table.filter((f) => f.group === g).length, g).toBeGreaterThanOrEqual(10);
  });

  it("matches the checked numbers for a spread of foods", () => {
    const at = (id: string) => table.find((f) => f.id === id)!;
    const checked: [string, number, number][] = [
      ["black-beans-cooked", 132, 8.86],
      ["lettuce-green-leaf", 22, 1.09],
      ["chicken-thigh-cooked", 179, 24.8],
      ["cooking-oil", 884, 0],
      ["guacamole", 155, 1.95],
      ["hummus", 229, 7.35],
      ["flour-tortilla", 306, 8.2],
      ["cola", 42, 0],
      ["beer", 43, 0.46],
      ["french-fries", 312, 3.43],
    ];
    for (const [id, kcal, protein] of checked) {
      expect(at(id).kcalPer100, id).toBe(kcal);
      expect(at(id).proteinPer100, id).toBeCloseTo(protein, 1);
    }
  });

  it("agrees with foods.json on the plan's own foods, except the three foods.json took from labels", () => {
    const fromLabels = new Set(["whey-protein", "salsa", "cocktail-sauce"]);
    const byId = new Map(table.map((f) => [f.id, f]));
    for (const p of foodsJson as { id: string; kcalPer100: number; proteinPer100: number }[]) {
      const f = byId.get(p.id);
      if (!f || fromLabels.has(p.id)) continue;
      expect(f.kcalPer100, p.id).toBe(p.kcalPer100);
      expect(Math.abs(f.proteinPer100 - p.proteinPer100), p.id).toBeLessThanOrEqual(0.05);
    }
  });

  it("has the food \"+ oil\" adds, and a first portion on every drink", () => {
    expect(table.find((f) => f.id === "cooking-oil")).toMatchObject({ name: "Cooking oil", group: "fat-oil" });
    expect(table.find((f) => f.id === "cola")!.portions[0]).toEqual({ label: "1 can (12 oz)", g: 368 });
  });
});

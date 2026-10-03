import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exercises, foods, meals, messages, plan } from "~/content";

const exercisesDoc = readFileSync(path.join(import.meta.dirname, "../../docs/exercises.md"), "utf8");

describe("content", () => {
  it("loads the starter library", () => {
    expect(meals.size).toBe(25);
    expect(foods.size).toBeGreaterThanOrEqual(38);
    expect(exercises.size).toBe(46);
  });

  it("references only known foods", () => {
    for (const meal of meals.values()) {
      for (const ing of meal.ingredients) expect(foods.has(ing.food), `${meal.slug} uses ${ing.food}`).toBe(true);
    }
  });

  it("keeps every meal inside its pool's calorie and protein range", () => {
    for (const meal of meals.values()) {
      const r = plan.poolRanges[meal.pool]!;
      expect(meal.kcal, `${meal.slug} kcal`).toBeGreaterThanOrEqual(r.kcalMin);
      expect(meal.kcal, `${meal.slug} kcal`).toBeLessThanOrEqual(r.kcalMax);
      expect(meal.protein, `${meal.slug} protein`).toBeGreaterThanOrEqual(r.proteinMin);
    }
  });

  it("uses url-safe slugs", () => {
    for (const meal of meals.values()) expect(meal.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("tags every ground beef meal", () => {
    for (const meal of meals.values()) {
      if (meal.ingredients.some((i) => i.food.startsWith("ground-beef"))) expect(meal.tags).toContain("ground-beef");
    }
  });

  it("has enough meals in every pool for the rotation", () => {
    const count = (pool: string) => [...meals.values()].filter((m) => m.pool === pool && m.mode === "any").length;
    expect(count("breakfast")).toBeGreaterThanOrEqual(4);
    expect(count("main")).toBeGreaterThanOrEqual(7);
    expect(count("snack")).toBeGreaterThanOrEqual(4);
    expect(count("dessert")).toBeGreaterThanOrEqual(4);
  });

  it("uses only known exercises in templates and every template weekday points at a template", () => {
    for (const [id, t] of Object.entries(plan.templates)) {
      for (const e of t.exercises) expect(exercises.has(e.exercise), `${id} uses ${e.exercise}`).toBe(true);
    }
    for (const id of [...Object.values(plan.training), ...Object.values(plan.optional), plan.planB]) {
      expect(plan.templates[id], id).toBeDefined();
    }
  });

  it("only uses exercise images that were checked by eye", () => {
    for (const ex of exercises.values()) expect(exercisesDoc, ex.dbId).toContain("`" + ex.dbId + "`");
  });

  it("has copy for every Rocky situation", () => {
    for (const key of ["relaxed-day", "missed-twice", "missed-today", "weigh-in-missing", "training-day-morning", "protein-behind", "steps-behind", "kitchen-closed", "on-plan", "default"]) {
      expect(messages[key]?.length, key).toBeGreaterThanOrEqual(3);
    }
  });
});

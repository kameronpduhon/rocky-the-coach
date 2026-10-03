import { describe, expect, it } from "vitest";
import { mealDate } from "~/domain/dates";
import { action, loader } from "~/routes/meal";
import { plannedForDate } from "~/server/meal-plan.server";
import { logsForDate, openBatch } from "~/server/meals.server";
import { db, post, routeArgs } from "./helpers";

describe("meal route", () => {
  it("loads a meal with ingredients, today's slot, and swap options", async () => {
    const today = mealDate();
    const lunch = (await plannedForDate(db(), today)).find((s) => s.slot === "lunch")!;
    const data = await loader(routeArgs(new Request(`http://localhost/meal/${lunch.meal.slug}?slot=lunch`), { slug: lunch.meal.slug }));
    expect(data.meal.slug).toBe(lunch.meal.slug);
    expect(data.ingredients.length).toBeGreaterThan(0);
    expect(data.ingredients[0]).toHaveProperty("state");
    expect(data.slot).toBe("lunch");
    expect(data.swapOptions.every((m) => m.pool === "main" && m.slug !== lunch.meal.slug)).toBe(true);
  });

  it("labels every ingredient with the state it is weighed in", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/meal/chicken-and-rice-bowl"), { slug: "chicken-and-rice-bowl" }));
    expect(data.ingredients.find((i) => i.food === "butter")?.state).toBe("As is");
    expect(data.ingredients.every((i) => ["Raw", "Cooked", "As is"].includes(i.state))).toBe(true);
  });

  it("404s an unknown meal", async () => {
    const res = await loader(routeArgs(new Request("http://localhost/meal/nope"), { slug: "nope" })).catch((e: Response) => e);
    expect((res as Response).status).toBe(404);
  });

  it("logs the meal for its slot", async () => {
    const today = mealDate();
    const snack = (await plannedForDate(db(), today)).find((s) => s.slot === "snack")!;
    await action(routeArgs(post(`http://localhost/meal/${snack.meal.slug}`, { intent: "ate", slot: "snack" }), { slug: snack.meal.slug }));
    const logs = await logsForDate(db(), today);
    expect(logs.some((l) => l.slot === "snack" && l.mealSlug === snack.meal.slug)).toBe(true);
  });

  it("creates a batch from the cooked weight", async () => {
    await action(routeArgs(post("http://localhost/meal/chicken-and-rice-bowl", { intent: "batch", portions: "3", cookedWeight: "492" }), { slug: "chicken-and-rice-bowl" }));
    expect((await openBatch(db(), "chicken-and-rice-bowl", mealDate()))?.portionG).toBe(165);
  });

  it("swaps the planned meal", async () => {
    const today = mealDate();
    const dinner = (await plannedForDate(db(), today)).find((s) => s.slot === "dinner")!;
    const target = dinner.meal.slug === "salmon-and-rice" ? "burger-bowl" : "salmon-and-rice";
    const res = (await action(routeArgs(post(`http://localhost/meal/${dinner.meal.slug}`, { intent: "swap", slot: "dinner", to: target, always: "false" }), { slug: dinner.meal.slug }))) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/meal/${target}?slot=dinner`);
  });
});

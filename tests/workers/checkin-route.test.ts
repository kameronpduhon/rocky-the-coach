import { between } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { plannedMeals } from "~/db/schema";
import { action as checkInAction, loader as checkInLoader } from "~/routes/check-in";
import { action as groceryAction, loader as groceryLoader } from "~/routes/groceries";
import { db, post, routeArgs } from "./helpers";

describe("check-in route", () => {
  it("loads a given week", async () => {
    const data = await checkInLoader(routeArgs(new Request("http://localhost/check-in?week=2026-10-12")));
    expect(data.data.weekStart).toBe("2026-10-12");
  });

  it("completes and redirects to groceries for next week", async () => {
    const res = (await checkInAction(routeArgs(post("http://localhost/check-in", { week: "2026-10-12", waist: "34.6", choice: "calories" })))) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/groceries?week=2026-10-19");
  });

  it("shows next week as saved once the check-in is done", async () => {
    const data = await checkInLoader(routeArgs(new Request("http://localhost/check-in?week=2026-10-12")));
    expect(data.data.done).toBe(true);
    const saved = await db().select().from(plannedMeals).where(between(plannedMeals.date, "2026-10-19", "2026-10-25")).all();
    expect(data.savedPlan).toHaveLength(35);
    expect(data.savedPlan).toEqual(expect.arrayContaining(saved.map((r) => ({ date: r.date, slot: r.slot, slug: r.mealSlug }))));
  });
});

describe("groceries route", () => {
  it("builds the list for a week and checks items off", async () => {
    const data = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2026-10-19")));
    expect(data.groups.length).toBeGreaterThan(0);
    const first = data.groups[0].items[0];
    await groceryAction(routeArgs(post("http://localhost/groceries", { week: "2026-10-19", food: first.foodId, checked: "true" })));
    const again = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2026-10-19")));
    expect(again.checked).toContain(first.foodId);
  });

  it("previews a future week without writing its plan", async () => {
    const data = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2027-03-01&rest=&from=check-in")));
    expect(data.planned).toBe(false);
    expect(data.count).toBeGreaterThan(0);
    expect(data.back).toBe("/check-in");
    expect(await db().select().from(plannedMeals).where(between(plannedMeals.date, "2027-03-01", "2027-03-07")).all()).toHaveLength(0);
  });
});

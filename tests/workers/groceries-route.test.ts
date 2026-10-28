import { between } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { plannedMeals } from "~/db/schema";
import { action as groceryAction, loader as groceryLoader } from "~/routes/groceries";
import { db, post, routeArgs } from "./helpers";

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

import { between } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { checkIns, plannedMeals } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { upsertSteps, logWeighIn } from "~/server/body.server";
import { checkInData, checkInWindow, completeCheckIn } from "~/server/checkin.server";
import { restedSlugs } from "~/server/meal-plan.server";
import { logOffPlan, logPlannedMeal } from "~/server/meals.server";
import { targetsFor } from "~/server/targets.server";
import { chicago, db } from "./helpers";

async function seedWeek(monday: string, startWeight: number, dailyLoss: number, onPlanDays: number) {
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    await logWeighIn(db(), date, Math.round((startWeight - dailyLoss * i) * 10) / 10, new Date());
    if (i < onPlanDays) {
      await logOffPlan(db(), date, { name: "Seed", category: "meal", kcal: 2300, proteinG: 185, relaxed: false }, new Date());
      await upsertSteps(db(), date, 7700, new Date());
    }
  }
}

describe("check-in window", () => {
  it("opens Sunday at 5pm and closes Monday at noon", () => {
    expect(checkInWindow(chicago("2026-10-18", "16:59"))).toBeNull();
    expect(checkInWindow(chicago("2026-10-18", "17:00"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "11:59"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "12:00"))).toBeNull();
  });
});

describe("check-in", () => {
  it("is too early with only one week of weigh-ins", async () => {
    await seedWeek("2026-09-28", 208.0, 0.15, 7);
    const data = await checkInData(db(), "2026-09-28");
    expect(data.outcome).toEqual({ kind: "too-early" });
  });

  it("summarizes the week and holds on pace", async () => {
    // Three weeks of weigh-ins give two weekly changes of about -1.0 lb, both weeks on plan.
    await seedWeek("2026-10-05", 207.0, 0.15, 7);
    await seedWeek("2026-10-12", 206.0, 0.15, 6);
    const chicken = meals.get("chicken-and-rice-bowl")!;
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) await logPlannedMeal(db(), d, "lunch", chicken, new Date());
    const data = await checkInData(db(), "2026-10-12");
    expect(data.adherence).toBe(6);
    expect(data.change).toBeCloseTo(-1.0, 1);
    expect(data.outcome).toEqual({ kind: "on-pace" });
    expect(data.avgSteps).toBe(6600);
    expect(data.mealCounts[0]).toEqual({ slug: "chicken-and-rice-bowl", name: chicken.name, count: 4, defaultRest: true });
  });

  it("applies targets, rests meals, plans next week, and records the check-in", async () => {
    await completeCheckIn(db(), "2026-10-12", { waist: 34.6, choice: "calories", rest: ["chicken-and-rice-bowl"] }, new Date());
    expect(await targetsFor(db(), "2026-10-19")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 7000 });
    expect(await restedSlugs(db(), "2026-10-19")).toContain("chicken-and-rice-bowl");
    const next = await db().select().from(plannedMeals).where(between(plannedMeals.date, "2026-10-19", "2026-10-25")).all();
    expect(next).toHaveLength(35);
    expect(next.map((r) => r.mealSlug)).not.toContain("chicken-and-rice-bowl");
    expect(await db().select().from(checkIns).all()).toHaveLength(1);
    expect((await checkInData(db(), "2026-10-12")).done).toBe(true);
  });

  it("ramps the step goal when the week averaged above it", async () => {
    // Oct 19 week: 7 on-plan days at 7,700 steps against a 7,000 goal
    await seedWeek("2026-10-19", 205.0, 0.15, 7);
    const data = await checkInData(db(), "2026-10-19");
    expect(data.rampedStepGoal).toBe(7500);
  });

  it("applies next week's swaps that fit the slot and the day", async () => {
    await completeCheckIn(
      db(),
      "2026-10-19",
      {
        waist: null,
        choice: "calories",
        rest: [],
        swaps: [
          { date: "2026-10-27", slot: "lunch", slug: "salmon-and-rice" },
          { date: "2026-10-28", slot: "dinner", slug: "steak-and-eggs" },
          { date: "2026-10-29", slot: "dinner", slug: "steak-salad" },
          { date: "2026-10-31", slot: "dinner", slug: "steak-salad" },
        ],
      },
      new Date(),
    );
    const rows = await db().select().from(plannedMeals).where(between(plannedMeals.date, "2026-10-26", "2026-11-01")).all();
    const at = (date: string, slot: string) => rows.find((r) => r.date === date && r.slot === slot)!;
    expect(at("2026-10-27", "lunch")).toMatchObject({ mealSlug: "salmon-and-rice", swapped: true });
    expect(at("2026-10-28", "dinner").mealSlug).not.toBe("steak-and-eggs");
    expect(at("2026-10-29", "dinner").mealSlug).not.toBe("steak-salad");
    expect(at("2026-10-31", "dinner")).toMatchObject({ mealSlug: "steak-salad", swapped: true });
  });
});

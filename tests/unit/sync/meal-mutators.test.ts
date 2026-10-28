import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { runMutation, type MutationContext } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

const ctx: MutationContext = { now: "2026-10-27T17:00:00.000Z", today: "2026-10-27" };
const run = (tx: MemoryTx, name: string, args: unknown, c = ctx) => runMutation(tx, name, args, c);
const BOWL = "chicken-and-rice-bowl";
const STEAK = "steak-and-baked-potato";
const THIGHS = "honey-glazed-chicken-thighs";
const ICE_CREAM = "protein-ice-cream";
const bowl = meals.get(BOWL)!;

/** A phone holding a 2,300 target from this Monday. */
function trimmed() {
  const tx = new MemoryTx(new Map());
  tx.put("targets", { effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 });
  return tx;
}

const logs = async (tx: MemoryTx, date: string) => (await tx.scan("meal_logs")).filter((l) => l.date === date);

describe("meal mutators", () => {
  it("logs a meal at the day's grams", async () => {
    const tx = trimmed();
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    const want = scaledMeal(bowl, factorFor(2300));
    expect(want.kcal).toBeLessThan(bowl.kcal);
    expect(await tx.get("meal_logs", "m-1")).toMatchObject({ category: "planned", kcal: want.kcal, protein_g: want.protein });
  });

  it("logs a batch portion at the grams it was cooked at", async () => {
    const tx = trimmed();
    tx.put("batches", { client_id: "b-1", meal_slug: BOWL, portions: 3, cooked_weight_g: 495, portion_g: 165, created_on: "2026-10-26", portions_left: 2, factor: 1 });
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    expect(await tx.get("meal_logs", "m-1")).toMatchObject({ kcal: bowl.kcal, protein_g: bowl.protein });
    expect(await tx.get("batches", "b-1")).toMatchObject({ portions_left: 1 });
  });

  it("skips a meal once, and undoing removes the skip", async () => {
    const tx = trimmed();
    await run(tx, "skipMeal", { clientId: "s-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    expect(await tx.get("meal_logs", "s-1")).toMatchObject({ slot: "lunch", meal_slug: null, name: bowl.name, category: "skipped", kcal: 0, protein_g: 0 });
    await expect(run(tx, "skipMeal", { clientId: "s-2", date: "2026-10-27", slot: "lunch", mealSlug: BOWL })).rejects.toThrow("already marked");
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    expect(await logs(tx, "2026-10-27")).toHaveLength(1);
    await run(tx, "unlogMeal", { key: "s-1" });
    expect(await logs(tx, "2026-10-27")).toHaveLength(0);
  });

  it("closes out a day, eating some and skipping others, and leaves marked slots alone", async () => {
    const tx = trimmed();
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    await run(tx, "closeOutDay", {
      date: "2026-10-27",
      eaten: [{ clientId: "c-1", slot: "lunch", mealSlug: BOWL }, { clientId: "c-2", slot: "dinner", mealSlug: THIGHS }],
      skipped: [{ clientId: "c-3", slot: "dessert", mealSlug: ICE_CREAM }],
    });
    const day = await logs(tx, "2026-10-27");
    expect(day.map((l) => [l.slot, l.category]).sort()).toEqual([["dessert", "skipped"], ["dinner", "planned"], ["lunch", "planned"]]);
    expect(await tx.get("meal_logs", "c-1")).toBeNull();
  });

  it("closes out up to 2 days back, and no further", async () => {
    const tx = trimmed();
    await run(tx, "closeOutDay", { date: "2026-10-25", eaten: [{ clientId: "c-1", slot: "dinner", mealSlug: THIGHS }], skipped: [] });
    await expect(run(tx, "closeOutDay", { date: "2026-10-24", eaten: [], skipped: [] })).rejects.toThrow("too long ago");
  });

  it("swaps a meal for today, and with always rests the old one for 4 weeks, keeping its photo", async () => {
    const tx = trimmed();
    tx.put("planned_meals", { date: "2026-10-27", slot: "lunch", meal_slug: BOWL, swapped: 0 });
    tx.put("meal_state", { slug: BOWL, photo_key: "meals/bowl.jpg", rested_until: null });
    await run(tx, "swapMeal", { date: "2026-10-27", slot: "lunch", mealSlug: STEAK, always: true });
    expect(await tx.get("planned_meals", "2026-10-27|lunch")).toMatchObject({ meal_slug: STEAK, swapped: 1 });
    expect(await tx.get("meal_state", BOWL)).toEqual({ slug: BOWL, photo_key: "meals/bowl.jpg", rested_until: "2026-11-24" });
  });

  it("refuses a swap that doesn't fit the slot, or a slot already eaten", async () => {
    const tx = trimmed();
    await expect(run(tx, "swapMeal", { date: "2026-10-27", slot: "lunch", mealSlug: ICE_CREAM, always: false })).rejects.toThrow("doesn't fit");
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    await expect(run(tx, "swapMeal", { date: "2026-10-27", slot: "lunch", mealSlug: STEAK, always: false })).rejects.toThrow("already eaten");
  });

  it("starts a batch at the day's factor and plans the same slot on the next days", async () => {
    const tx = trimmed();
    await run(tx, "startBatch", { clientId: "b-2", date: "2026-10-27", slot: "lunch", mealSlug: BOWL, portions: 3, cookedWeightG: 495 });
    expect(await tx.get("batches", "b-2")).toMatchObject({ meal_slug: BOWL, portions: 3, portion_g: 165, portions_left: 3, created_on: "2026-10-27", factor: factorFor(2300) });
    expect(await tx.get("planned_meals", "2026-10-28|lunch")).toMatchObject({ meal_slug: BOWL, swapped: 1 });
    expect(await tx.get("planned_meals", "2026-10-29|lunch")).toMatchObject({ meal_slug: BOWL, swapped: 1 });
  });

  it("leaves a marked slot and next week alone when batching", async () => {
    const sat = { now: "2026-10-31T17:00:00.000Z", today: "2026-10-31" };
    const tx = trimmed();
    await run(tx, "skipMeal", { clientId: "s-1", date: "2026-11-01", slot: "lunch", mealSlug: BOWL }, sat);
    await run(tx, "startBatch", { clientId: "b-3", date: "2026-10-31", slot: "lunch", mealSlug: BOWL, portions: 3, cookedWeightG: 495 }, sat);
    expect(await tx.get("planned_meals", "2026-11-01|lunch")).toBeNull();
    expect(await tx.get("planned_meals", "2026-11-02|lunch")).toBeNull();
  });
});

describe("usual orders", () => {
  const order = { date: "2026-10-27", name: "Chipotle bowl, double chicken", category: "meal", kcal: 1050, proteinG: 75, relaxed: true };

  it("saves an off-plan entry as a usual, then logs it in one tap", async () => {
    const tx = trimmed();
    await run(tx, "logOffPlan", { clientId: "o-1", ...order, usualId: "u-1" });
    expect(await tx.get("usual_orders", "u-1")).toEqual({
      client_id: "u-1", name: order.name, category: "meal", kcal: 1050, protein_g: 75, relaxed: 1, uses: 1, last_used_at: ctx.now, created_at: ctx.now,
    });
    const later = { now: "2026-10-28T01:00:00.000Z", today: "2026-10-27" };
    await run(tx, "logUsual", { clientId: "o-2", usual: "u-1", date: "2026-10-27" }, later);
    expect(await tx.get("meal_logs", "o-2")).toMatchObject({ slot: null, meal_slug: null, name: order.name, category: "meal", kcal: 1050, protein_g: 75, relaxed: 1 });
    expect(await tx.get("usual_orders", "u-1")).toMatchObject({ uses: 2, last_used_at: later.now });
  });

  it("logs off-plan without saving a usual by default", async () => {
    const tx = trimmed();
    await run(tx, "logOffPlan", { clientId: "o-1", ...order });
    expect(await tx.scan("usual_orders")).toEqual([]);
  });

  it("refuses an unknown usual, and removes one", async () => {
    const tx = trimmed();
    await expect(run(tx, "logUsual", { clientId: "o-1", usual: "nope", date: "2026-10-27" })).rejects.toThrow("isn't saved");
    await run(tx, "logOffPlan", { clientId: "o-1", ...order, usualId: "u-1" });
    await run(tx, "removeUsual", { key: "u-1" });
    expect(await tx.get("usual_orders", "u-1")).toBeNull();
  });
});

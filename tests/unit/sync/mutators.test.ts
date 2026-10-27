import { describe, expect, it } from "vitest";
import { MemoryTx } from "~/sync/tx";
import { MutationRejected, runMutation, type MutationContext } from "~/sync/mutators";

const ctx: MutationContext = { now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" };
const fresh = () => new MemoryTx(new Map());

describe("mutators", () => {
  it("logs, edits and deletes a weigh-in", async () => {
    const tx = fresh();
    await runMutation(tx, "logWeighIn", { date: "2026-10-27", weightLb: 205.14 }, ctx);
    expect(await tx.get("weigh_ins", "2026-10-27")).toEqual({ date: "2026-10-27", weight_lb: 205.1, logged_at: ctx.now });
    await runMutation(tx, "editWeighIn", { date: "2026-10-27", weightLb: 204.8 }, { ...ctx, now: "2026-10-27T18:00:00.000Z" });
    expect(await tx.get("weigh_ins", "2026-10-27")).toMatchObject({ weight_lb: 204.8, logged_at: ctx.now });
    await runMutation(tx, "deleteWeighIn", { date: "2026-10-27" }, ctx);
    expect(await tx.get("weigh_ins", "2026-10-27")).toBeNull();
  });

  it("logs a planned meal once, with its macros, and uses a batch portion", async () => {
    const tx = fresh();
    tx.put("batches", { id: 3, meal_slug: "chicken-and-rice-bowl", portions: 3, cooked_weight_g: 495, portion_g: 165, created_on: "2026-10-26", portions_left: 2 });
    await runMutation(tx, "logMeal", { clientId: "c-1", date: "2026-10-27", slot: "lunch", mealSlug: "chicken-and-rice-bowl" }, ctx);
    await runMutation(tx, "logMeal", { clientId: "c-2", date: "2026-10-27", slot: "lunch", mealSlug: "chicken-and-rice-bowl" }, ctx);
    const logs = await tx.scan("meal_logs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ client_id: "c-1", slot: "lunch", category: "planned", name: "Chicken and rice bowl" });
    expect(logs[0].kcal).toBeGreaterThan(0);
    expect(await tx.get("batches", "id:3")).toMatchObject({ portions_left: 1 });
  });

  it("logs and removes an off-plan item", async () => {
    const tx = fresh();
    await runMutation(tx, "logOffPlan", { clientId: "c-9", date: "2026-10-27", name: "Ranch Water", category: "drink", kcal: 100, proteinG: 0, relaxed: false }, ctx);
    expect(await tx.get("meal_logs", "c-9")).toMatchObject({ name: "Ranch Water", slot: null, relaxed: 0 });
    await runMutation(tx, "deleteOffPlan", { key: "c-9" }, ctx);
    expect(await tx.get("meal_logs", "c-9")).toBeNull();
  });

  it("saves a reminder and the voice", async () => {
    const tx = fresh();
    await runMutation(tx, "setReminder", { kind: "weigh-in", enabled: false, time: "07:15" }, ctx);
    expect(await tx.get("reminder_settings", "weigh-in")).toEqual({ kind: "weigh-in", enabled: 0, time: "07:15" });
    await runMutation(tx, "setVoice", { voice: "plain" }, ctx);
    expect(await tx.get("profile", "me")).toEqual({ id: "me", voice: "plain" });
  });

  it("rejects bad args, unknown names, unknown meals and far-future dates", async () => {
    const tx = fresh();
    await expect(runMutation(tx, "logWeighIn", { date: "2026-10-27", weightLb: 20 }, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "nope", {}, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "constructor", {}, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "logMeal", { clientId: "c", date: "2026-10-27", slot: "lunch", mealSlug: "pizza" }, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "logWeighIn", { date: "2026-11-05", weightLb: 200 }, ctx)).rejects.toBeInstanceOf(MutationRejected);
  });
});

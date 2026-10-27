import { describe, expect, it } from "vitest";
import { SyncStore } from "~/sync/store";

const ctx = () => ({ now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" });

describe("SyncStore", () => {
  it("shows a change the moment it is made", async () => {
    const store = new SyncStore(ctx);
    await store.mutate("logWeighIn", { date: "2026-10-27", weightLb: 205 });
    expect(store.rows("weigh_ins")).toEqual([expect.objectContaining({ date: "2026-10-27", weight_lb: 205 })]);
    expect(store.pending).toHaveLength(1);
  });

  it("keeps unconfirmed changes on top of what the server sends", async () => {
    const store = new SyncStore(ctx);
    await store.mutate("logWeighIn", { date: "2026-10-27", weightLb: 205 });
    await store.mutate("setVoice", { voice: "plain" });
    await store.applyPull({ version: 10, lastMutationId: 1, snapshot: true, puts: { weigh_ins: [{ date: "2026-10-27", weight_lb: 205, logged_at: "x" }] }, dels: {} });
    expect(store.pending.map((m) => m.name)).toEqual(["setVoice"]);
    expect(store.rows("profile")).toEqual([{ id: "me", voice: "plain" }]);
    expect(store.version).toBe(10);
  });

  it("applies deltas and deletes", async () => {
    const store = new SyncStore(ctx);
    await store.applyPull({ version: 1, lastMutationId: 0, snapshot: true, puts: { weigh_ins: [{ date: "a", weight_lb: 1 }, { date: "b", weight_lb: 2 }] }, dels: {} });
    await store.applyPull({ version: 2, lastMutationId: 0, snapshot: false, puts: { weigh_ins: [{ date: "c", weight_lb: 3 }] }, dels: { weigh_ins: ["a"] } });
    expect(store.rows("weigh_ins").map((r) => r.date).sort()).toEqual(["b", "c"]);
  });

  it("replaces the phone's copy of a new row with the server's", async () => {
    const store = new SyncStore(ctx);
    await store.mutate("logOffPlan", { clientId: "c-1", date: "2026-10-27", name: "Chips", category: "snack", kcal: 160, proteinG: 2, relaxed: false });
    await store.applyPull({ version: 3, lastMutationId: 1, snapshot: false, puts: { meal_logs: [{ id: 41, client_id: "c-1", name: "Chips", kcal: 160 }] }, dels: {} });
    expect(store.rows("meal_logs")).toEqual([expect.objectContaining({ id: 41, client_id: "c-1" })]);
  });

  it("refuses a change the mutator rejects without queueing it", async () => {
    const store = new SyncStore(ctx);
    await expect(store.mutate("logWeighIn", { date: "2026-10-27", weightLb: 5 })).rejects.toThrow();
    expect(store.pending).toHaveLength(0);
  });

  it("notifies subscribers and round-trips through a saved state", async () => {
    const store = new SyncStore(ctx);
    let calls = 0;
    store.subscribe(() => calls++);
    await store.mutate("setVoice", { voice: "plain" });
    expect(calls).toBeGreaterThan(0);
    const copy = new SyncStore(ctx);
    await copy.restore(store.save());
    expect(copy.rows("profile")).toEqual([{ id: "me", voice: "plain" }]);
    expect(copy.pending).toHaveLength(1);
  });
});

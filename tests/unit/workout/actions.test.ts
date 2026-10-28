import { describe, expect, it } from "vitest";
import { runMutation } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";
import { workoutActions } from "~/workout/actions";
import { dropLift } from "~/workout/lifts";
import { buildWorkout } from "~/workout/model";

// Wednesday at noon in Chicago.
const ctx = { now: "2026-10-28T17:00:00.000Z", today: "2026-10-28" };

function harness() {
  const tx = new MemoryTx(new Map());
  let ids = 0;
  const mutate = async (name: string, args: unknown) => {
    try {
      await runMutation(tx, name, args, ctx);
      return true;
    } catch {
      return false;
    }
  };
  const rows = (name: string) => [...(tx.tables.get(name)?.values() ?? [])];
  const model = (date?: string) => buildWorkout(rows, new Date(ctx.now), { date });
  const act = (date?: string) => workoutActions(model(date), mutate, () => new Date(ctx.now), () => `id-${++ids}`);
  return { tx, rows, model, act, mutate };
}

describe("workout actions", () => {
  it("plans the workout on its first edit, then changes its list", async () => {
    const h = harness();
    expect(await h.act().editLifts((list) => dropLift(list, 1))).toBe(true);
    expect(h.model()).toMatchObject({ screen: "plan", key: "id-1" });
    expect(h.model().lifts.map((l) => l.position)).toEqual([0, 2, 3, 4, 5]);
  });

  it("starts a workout that was never saved", async () => {
    const h = harness();
    await h.act().start();
    expect(h.model()).toMatchObject({ screen: "set", startedAt: ctx.now });
  });

  it("logs a set, and then refuses to skip that lift", async () => {
    const h = harness();
    await h.act().start();
    const m = h.model();
    await h.act().logSet(m.lifts[0], 1, 280, 11);
    expect(h.model().lifts[0].sets).toMatchObject([{ setNumber: 1, weight: 280, reps: 11 }]);
    expect(await h.act().editLifts((list) => dropLift(list, 0))).toBe(false);
  });

  it("swaps for good: the override for later weeks and today's list", async () => {
    const h = harness();
    await h.act().swapAlways(h.model().lifts[5], "dumbbell-lateral-raise");
    expect(h.rows("exercise_overrides")).toEqual([{ template_id: "wed-legs-shoulders", position: 5, exercise_id: "dumbbell-lateral-raise" }]);
    expect(h.model().lifts[5]).toMatchObject({ exercise: "dumbbell-lateral-raise", from: "plan" });
  });

  it("finishes a workout that finished by the next-day rule before rating it", async () => {
    const h = harness();
    const TUE = "2026-10-27";
    await h.mutate("planWorkout", { clientId: "w-0", date: TUE, templateId: "wed-legs-shoulders", at: `${TUE}T17:00:00.000Z` });
    await h.mutate("startWorkout", { workout: "w-0", at: `${TUE}T17:00:00.000Z` });
    await h.mutate("logSet", { clientId: "s-0", workout: "w-0", position: 0, exercise: "leg-press", setNumber: 1, weightLb: 280, reps: 12, at: `${TUE}T17:20:00.000Z` });
    expect(h.model(TUE)).toMatchObject({ screen: "done", endedAt: null });
    expect(await h.act(TUE).rate("hard")).toBe(true);
    expect(h.model(TUE)).toMatchObject({ endedAt: `${TUE}T17:20:00.000Z`, feel: "hard" });
  });

  it("logs a past day after the fact as finished", async () => {
    const h = harness();
    await h.act("2026-10-26").logLate();
    expect(h.model("2026-10-26")).toMatchObject({ screen: "done", templateId: "mon-chest-back-arms" });
  });
});

import { describe, expect, it } from "vitest";
import { exercises, plan } from "~/content";
import { runMutation } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

const ctx = { now: "2026-10-28T17:00:00.000Z", today: "2026-10-28" };
const run = (tx: MemoryTx, name: string, args: unknown) => runMutation(tx, name, args, ctx);
const W = "w-1";
const LEGS = "wed-legs-shoulders";
const FIRST = plan.templates[LEGS]!.exercises[0].exercise;
const OTHER = [...exercises.keys()].find((id) => id !== FIRST)!;
const fresh = () => new MemoryTx(new Map());

async function planned(tx = fresh()) {
  await run(tx, "planWorkout", { clientId: W, date: "2026-10-28", templateId: LEGS, at: ctx.now });
  return tx;
}

const set = (overrides: Record<string, unknown> = {}) => ({ clientId: "s-1", workout: W, position: 0, exercise: FIRST, setNumber: 1, weightLb: 280, reps: 11, at: ctx.now, ...overrides });

describe("workout mutators", () => {
  it("plans a workout without starting it, and retargets it before the start", async () => {
    const tx = await planned();
    expect(await tx.get("workout_sessions", W)).toMatchObject({ client_id: W, template_id: LEGS, started_at: null, planned_at: ctx.now, lifts: null });
    await run(tx, "setLifts", { workout: W, lifts: [{ position: 100, exercise: OTHER, repMin: 8, repMax: 12, from: "added" }] });
    await run(tx, "planWorkout", { clientId: "w-2", date: "2026-10-28", templateId: "mon-chest-back-arms", at: ctx.now });
    const rows = await tx.scan("workout_sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ client_id: W, template_id: "mon-chest-back-arms", lifts: null });
  });

  it("refuses to switch a workout that has started", async () => {
    const tx = await planned();
    await run(tx, "startWorkout", { workout: W, at: ctx.now });
    await expect(run(tx, "planWorkout", { clientId: "w-2", date: "2026-10-28", templateId: "mon-chest-back-arms", at: ctx.now })).rejects.toThrow("already started");
  });

  it("logs a set keyed to its workout, starting the workout if needed", async () => {
    const tx = await planned();
    await run(tx, "logSet", set());
    expect(await tx.get("set_logs", "s-1")).toMatchObject({ session_key: W, exercise_id: FIRST, position: 0, set_number: 1, weight_lb: 280, reps: 11, logged_at: ctx.now });
    expect(await tx.get("workout_sessions", W)).toMatchObject({ started_at: ctx.now });
  });

  it("refuses a time more than 5 minutes ahead or 2 days back, and an unknown workout", async () => {
    const tx = await planned();
    await expect(run(tx, "logSet", set({ at: "2026-10-28T17:10:00.000Z" }))).rejects.toThrow("in the future");
    await expect(run(tx, "logSet", set({ at: "2026-10-25T17:00:00.000Z" }))).rejects.toThrow("too long ago");
    await expect(run(tx, "logSet", set({ workout: "nope" }))).rejects.toThrow("isn't saved");
  });

  it("edits and deletes a set", async () => {
    const tx = await planned();
    await run(tx, "logSet", set());
    await run(tx, "editSet", { key: "s-1", weightLb: 290, reps: 10 });
    expect(await tx.get("set_logs", "s-1")).toMatchObject({ weight_lb: 290, reps: 10 });
    await run(tx, "deleteSet", { key: "s-1" });
    expect(await tx.get("set_logs", "s-1")).toBeNull();
  });

  it("refuses a lift list that drops a lift with sets", async () => {
    const tx = await planned();
    await run(tx, "logSet", set());
    await expect(run(tx, "setLifts", { workout: W, lifts: [] })).rejects.toThrow("has sets logged");
  });

  it("checks a lift done without numbers, and undoes it", async () => {
    const tx = await planned();
    await run(tx, "checkLift", { workout: W, exercise: FIRST, done: true });
    expect(await tx.get("exercise_checks", `${W}|${FIRST}`)).toMatchObject({ session_key: W, exercise_id: FIRST });
    await run(tx, "checkLift", { workout: W, exercise: FIRST, done: false });
    expect(await tx.get("exercise_checks", `${W}|${FIRST}`)).toBeNull();
  });

  it("takes a feel only after the finish, and clears it with null", async () => {
    const tx = await planned();
    await expect(run(tx, "rateWorkout", { workout: W, feel: "hard" })).rejects.toThrow("Finish the workout first");
    await run(tx, "finishWorkout", { workout: W, at: ctx.now });
    await run(tx, "rateWorkout", { workout: W, feel: "hard" });
    expect(await tx.get("workout_sessions", W)).toMatchObject({ ended_at: ctx.now, started_at: ctx.now, feel: "hard" });
    await run(tx, "rateWorkout", { workout: W, feel: null });
    expect(await tx.get("workout_sessions", W)).toMatchObject({ feel: null });
  });

  it("saves a note, and deletes it when emptied", async () => {
    const tx = fresh();
    await run(tx, "setNote", { exercise: FIRST, note: "Seat on 4" });
    expect(await tx.get("exercise_notes", FIRST)).toMatchObject({ note: "Seat on 4", updated_at: ctx.now });
    await run(tx, "setNote", { exercise: FIRST, note: "  " });
    expect(await tx.get("exercise_notes", FIRST)).toBeNull();
  });

  it("trades two days' workouts, and refuses a day already logged", async () => {
    const tx = fresh();
    await run(tx, "moveWorkout", { a: "2026-10-28", b: "2026-10-29" });
    expect(await tx.scan("schedule_moves")).toEqual(
      expect.arrayContaining([
        { date: "2026-10-28", template_id: null },
        { date: "2026-10-29", template_id: LEGS },
      ]),
    );
    const logged = await planned();
    await run(logged, "logSet", set());
    await expect(run(logged, "moveWorkout", { a: "2026-10-28", b: "2026-10-30" })).rejects.toThrow("already logged");
  });

  it("saves an always-swap", async () => {
    const tx = fresh();
    await run(tx, "swapAlways", { templateId: LEGS, position: 0, exercise: OTHER });
    expect(await tx.get("exercise_overrides", `${LEGS}|0`)).toEqual({ template_id: LEGS, position: 0, exercise_id: OTHER });
  });

  it("drops a workout planned but not started when its day moves, and keeps a started one", async () => {
    const tx = await planned();
    await run(tx, "moveWorkout", { a: "2026-10-28", b: "2026-10-29" });
    expect(await tx.get("workout_sessions", W)).toBeNull();

    const started = await planned();
    await run(started, "startWorkout", { workout: W, at: ctx.now });
    await run(started, "moveWorkout", { a: "2026-10-28", b: "2026-10-29" });
    expect(await started.get("workout_sessions", W)).toMatchObject({ started_at: ctx.now });
  });

  it("plans a workout as far as the end of the week ahead, for a this-week swap, and no further", async () => {
    const tx = fresh();
    await run(tx, "planWorkout", { clientId: "w-fri", date: "2026-10-30", templateId: "fri-chest-shoulders-arms", at: ctx.now });
    expect(await tx.get("workout_sessions", "w-fri")).toMatchObject({ date: "2026-10-30", template_id: "fri-chest-shoulders-arms", started_at: null, lifts: null });
    await expect(run(tx, "planWorkout", { clientId: "w-mon", date: "2026-11-02", templateId: "mon-chest-back-arms", at: ctx.now })).rejects.toThrow("That date is in the future.");
    // On a Sunday the week ahead is the one starting tomorrow.
    await runMutation(tx, "planWorkout", { clientId: "w-wed", date: "2026-10-28", templateId: LEGS, at: "2026-10-25T23:00:00.000Z" }, { now: "2026-10-25T23:00:00.000Z", today: "2026-10-25" });
    expect(await tx.get("workout_sessions", "w-wed")).toMatchObject({ date: "2026-10-28" });
  });
});

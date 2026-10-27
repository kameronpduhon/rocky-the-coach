import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { checkExercise, endSession, goUps, lastSessionSets, logSet, resolveTemplate, setCustomExercises, swapExercise, workoutView } from "~/server/workouts.server";
import { db } from "./helpers";

const MON = "mon-chest-back-arms";

async function logBothSets(date: string, position: number, exerciseId: string, weight: number, reps: [number, number]) {
  for (const [i, r] of reps.entries()) {
    await logSet(db(), { date, templateId: MON, position, exerciseId, setNumber: i + 1, weightLb: weight, reps: r, clientId: crypto.randomUUID() }, new Date());
  }
}

describe("workouts", () => {
  it("resolves the plan template in order", async () => {
    const slots = await resolveTemplate(db(), MON, "2026-10-12");
    expect(slots.map((s) => s.exercise.id)).toEqual([
      "incline-dumbbell-press", "pec-deck", "lat-pulldown", "seated-cable-row", "preacher-curl", "cable-triceps-pushdown",
    ]);
  });

  it("finds last session's sets for an exercise", async () => {
    await logBothSets("2026-10-05", 0, "incline-dumbbell-press", 55, [10, 9]);
    await logBothSets("2026-10-12", 0, "incline-dumbbell-press", 60, [10, 10]);
    expect(await lastSessionSets(db(), "incline-dumbbell-press", "2026-10-19")).toEqual([
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
    ]);
    expect(await lastSessionSets(db(), "incline-dumbbell-press", "2026-10-12")).toEqual([
      { weight: 55, reps: 10 },
      { weight: 55, reps: 9 },
    ]);
  });

  it("suggests going up after both sets hit the top of the range", async () => {
    const view = await workoutView(db(), "2026-10-19", MON);
    const incline = view.exercises[0];
    expect(incline.suggestion).toEqual({ weight: 65, goUp: true });
    expect(view.sets).toBe(2);
    expect(await goUps(db(), "2026-10-19", MON)).toEqual(["Incline dumbbell press goes up to 65 lb today"]);
  });

  it("says what comes next once an exercise is done today", async () => {
    const view = await workoutView(db(), "2026-10-12", MON);
    expect(view.exercises[0].done).toBe(true);
    expect(view.exercises[0].nextTime).toBe(65);
  });

  it("never logs the same set twice for one clientId", async () => {
    const input = { date: "2026-10-26", templateId: MON, position: 1, exerciseId: "pec-deck", setNumber: 1, weightLb: 140, reps: 12, clientId: "same" };
    await logSet(db(), input, new Date());
    await logSet(db(), input, new Date());
    const view = await workoutView(db(), "2026-10-26", MON);
    expect(view.exercises[1].logged).toHaveLength(1);
    expect(view.startedAt).not.toBeNull();
  });

  it("marks an exercise done once its sets are logged and uses 1 set in deload week", async () => {
    await logBothSets("2026-11-02", 2, "lat-pulldown", 130, [10, 9]);
    expect((await workoutView(db(), "2026-11-02", MON)).exercises[2].done).toBe(true);
    const deload = await workoutView(db(), "2026-11-23", MON);
    expect(deload.sets).toBe(1);
    expect(deload.exercises[0].suggestion.goUp).toBe(false);
  });

  it("swaps for today only without touching other days", async () => {
    await swapExercise(db(), "2026-11-09", MON, 1, "cable-crossover", false);
    expect((await resolveTemplate(db(), MON, "2026-11-09"))[1].exercise.id).toBe("cable-crossover");
    expect((await resolveTemplate(db(), MON, "2026-11-16"))[1].exercise.id).toBe("pec-deck");
  });

  it("swaps for good and keeps separate history per exercise", async () => {
    await swapExercise(db(), "2026-11-09", MON, 4, "machine-preacher-curl", true);
    const later = await resolveTemplate(db(), MON, "2026-11-16");
    expect(later[4].exercise.id).toBe("machine-preacher-curl");
    expect(later[4].swapped).toBe(true);
    expect(await lastSessionSets(db(), "machine-preacher-curl", "2026-11-16")).toBeNull();
  });

  it("offers swaps from the same group only", async () => {
    const view = await workoutView(db(), "2026-11-30", MON);
    const pecDeck = view.exercises[1];
    expect(pecDeck.swapOptions.length).toBeGreaterThan(0);
    expect(pecDeck.swapOptions.map((o) => o.id)).not.toContain("pec-deck");
    expect(pecDeck.swapOptions.map((o) => o.id)).toContain("cable-crossover");
  });

  it("ends a session", async () => {
    await endSession(db(), "2026-10-12", MON, new Date("2026-10-12T18:00:00Z"));
    expect((await workoutView(db(), "2026-10-12", MON)).endedAt).toBe("2026-10-12T18:00:00.000Z");
  });

  it("keys v1 sets and checks to their workout, and keeps a custom list in lifts", async () => {
    const now = new Date("2026-10-28T17:00:00Z");
    await logSet(db(), { date: "2026-10-28", templateId: "wed-legs-shoulders", position: 0, exerciseId: "leg-press", setNumber: 1, weightLb: 270, reps: 12, clientId: "v1-set" }, now);
    await checkExercise(db(), "2026-10-28", "wed-legs-shoulders", "seated-leg-curl", true, now);
    const session = await env.DB.prepare("SELECT id FROM workout_sessions WHERE template_id = 'wed-legs-shoulders' AND date = '2026-10-28'").first<{ id: number }>();
    expect(await env.DB.prepare("SELECT session_key FROM set_logs WHERE client_id = 'v1-set'").first()).toEqual({ session_key: `id:${session!.id}` });
    expect(await env.DB.prepare("SELECT session_key FROM exercise_checks WHERE exercise_id = 'seated-leg-curl'").first()).toEqual({ session_key: `id:${session!.id}` });

    await setCustomExercises(db(), "2026-10-28", ["leg-press", "seated-leg-curl"], now);
    const custom = await env.DB.prepare("SELECT lifts FROM workout_sessions WHERE template_id = 'custom'").first<{ lifts: string }>();
    expect(JSON.parse(custom!.lifts).map((l: { exercise: string; position: number }) => [l.position, l.exercise])).toEqual([[0, "leg-press"], [1, "seated-leg-curl"]]);
  });
});

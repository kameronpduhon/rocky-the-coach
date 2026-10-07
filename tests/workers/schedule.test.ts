import { describe, expect, it } from "vitest";
import { action } from "~/routes/plan";
import { loadDay } from "~/server/day.server";
import { runReminders } from "~/server/reminders.server";
import type { PushMessage } from "~/server/push.server";
import { moveWorkout, movesBetween } from "~/server/schedule.server";
import { logSet } from "~/server/workouts.server";
import { chicago, db, post, routeArgs } from "./helpers";

// The database persists across tests in this file, so each test works in its own week.
describe("moving a workout", () => {
  it("trades a workout onto a rest day and leaves its old day resting", async () => {
    expect(await moveWorkout(db(), "2026-10-14", "2026-10-13")).toBeNull();
    expect(await movesBetween(db(), "2026-10-12", "2026-10-18")).toEqual({ "2026-10-13": "wed-legs-shoulders", "2026-10-14": null });

    const tuesday = await loadDay(db(), "2026-10-13", chicago("2026-10-13", "09:00"));
    expect(tuesday.training?.name).toBe("Legs, Shoulders");
    const wednesday = await loadDay(db(), "2026-10-14", chicago("2026-10-14", "09:00"));
    expect(wednesday.training).toBeNull();
    expect(wednesday.week.find((d) => d.date === "2026-10-13")?.templateId).toBe("wed-legs-shoulders");
  });

  it("forgets the move once both days are back where they started", async () => {
    await moveWorkout(db(), "2026-11-04", "2026-11-03");
    await moveWorkout(db(), "2026-11-03", "2026-11-04");
    expect(await movesBetween(db(), "2026-11-02", "2026-11-08")).toEqual({});
  });

  it("swaps two workout days", async () => {
    await moveWorkout(db(), "2026-10-26", "2026-10-30");
    expect(await movesBetween(db(), "2026-10-26", "2026-11-01")).toEqual({ "2026-10-26": "fri-chest-shoulders-arms", "2026-10-30": "mon-chest-back-arms" });
  });

  it("refuses moves across weeks, between rest days, or of a logged workout", async () => {
    expect(await moveWorkout(db(), "2026-11-13", "2026-11-16")).toBe("Pick another day this week.");
    expect(await moveWorkout(db(), "2026-11-10", "2026-11-12")).toBe("Neither day has a workout.");
    await logSet(db(), { date: "2026-11-09", templateId: "mon-chest-back-arms", position: 0, exerciseId: "incline-dumbbell-press", setNumber: 1, weightLb: 50, reps: 8, clientId: "m1" }, new Date());
    expect(await moveWorkout(db(), "2026-11-09", "2026-11-10")).toBe("That workout is already logged.");
  });

  it("moves through the Plan action", async () => {
    const res = await action(routeArgs(post("http://localhost/plan", { intent: "move", a: "2026-11-17", b: "2026-11-18" })));
    expect(res).toEqual({ ok: true });
    expect(await action(routeArgs(post("http://localhost/plan", { intent: "move", a: "nope", b: "2026-10-14" })))).toEqual({ error: "Pick a day this week." });
  });

  it("sends the lift reminder on the day a workout moved to, not the day it left", async () => {
    await moveWorkout(db(), "2026-10-21", "2026-10-20");
    const sent: PushMessage[] = [];
    const send = async (_db: unknown, m: PushMessage) => (sent.push(m), 1);
    await runReminders(db(), chicago("2026-10-20", "11:30"), send);
    expect(sent.map((m) => m.title)).toContain("Lift at noon");
    sent.length = 0;
    await runReminders(db(), chicago("2026-10-21", "11:30"), send);
    expect(sent.map((m) => m.title)).not.toContain("Lift at noon");
  });
});

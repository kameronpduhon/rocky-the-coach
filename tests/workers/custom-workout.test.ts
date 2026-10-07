import { describe, expect, it } from "vitest";
import { addDays, localDate } from "~/domain/dates";
import { action, loader } from "~/routes/workout";
import { datesWithWorkouts } from "~/server/history.server";
import { progressData } from "~/server/progress.server";
import { workoutView } from "~/server/workouts.server";
import { db, post, routeArgs } from "./helpers";

// The database persists across tests in this file, so each test uses its own day.
const day = (n: number) => addDays(localDate(), -n);
const send = (fields: Record<string, string>) => action(routeArgs(post("http://localhost/workout", fields)));

describe("custom workouts", () => {
  it("starts empty with every exercise to pick from", async () => {
    const data = await loader(routeArgs(new Request(`http://localhost/workout?template=custom&date=${day(1)}`)));
    expect(data.view.name).toBe("Custom workout");
    expect(data.view.exercises).toEqual([]);
    expect(data.catalog.length).toBeGreaterThan(40);
  });

  it("builds a workout from picked exercises and logs sets into it", async () => {
    const date = day(2);
    await send({ intent: "set-exercises", templateId: "custom", date, exercises: "leg-press,pull-up,not-an-exercise" });
    await send({ intent: "log-set", templateId: "custom", date, position: "1", exerciseId: "pull-up", setNumber: "1", weight: "0", reps: "8", clientId: "c1" });
    const view = await workoutView(db(), date, "custom");
    expect(view.exercises.map((e) => e.id)).toEqual(["leg-press", "pull-up"]);
    expect(view.exercises[1].logged).toEqual([expect.objectContaining({ reps: 8 })]);
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set([date]));
  });

  it("keeps a logged exercise when it is unpicked and appends new picks", async () => {
    const date = day(3);
    await send({ intent: "set-exercises", templateId: "custom", date, exercises: "leg-press,pull-up" });
    await send({ intent: "log-set", templateId: "custom", date, position: "0", exerciseId: "leg-press", setNumber: "1", weight: "270", reps: "10", clientId: "c2" });
    await send({ intent: "set-exercises", templateId: "custom", date, exercises: "hammer-curl" });
    const view = await workoutView(db(), date, "custom");
    expect(view.exercises.map((e) => e.id)).toEqual(["leg-press", "hammer-curl"]);
    expect(view.exercises[0].logged).toHaveLength(1);
  });
});

describe("logging without numbers", () => {
  it("checks an exercise off as done and counts the workout", async () => {
    const date = day(4);
    await send({ intent: "check", templateId: "wed-legs-shoulders", date, exerciseId: "leg-press", done: "true" });
    const view = await workoutView(db(), date, "wed-legs-shoulders");
    expect(view.exercises[0]).toEqual(expect.objectContaining({ checked: true, done: true }));
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set([date]));

    await send({ intent: "check", templateId: "wed-legs-shoulders", date, exerciseId: "leg-press", done: "false" });
    expect((await workoutView(db(), date, "wed-legs-shoulders")).exercises[0].checked).toBe(false);
  });

  it("marks a whole workout done with nothing logged", async () => {
    const date = day(5);
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set());
    await send({ intent: "end", templateId: "mon-chest-back-arms", date, from: "plan" });
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set([date]));
  });

  it("shows custom and no-numbers workouts in Progress", async () => {
    const date = day(6);
    await send({ intent: "set-exercises", templateId: "custom", date, exercises: "pull-up" });
    await send({ intent: "end", templateId: "custom", date, from: "progress" });
    const { recentWorkouts } = await progressData(db(), localDate());
    expect(recentWorkouts).toContainEqual(expect.objectContaining({ date, name: "Custom workout", sets: 0 }));
  });

  it("does not count a custom workout that was only started", async () => {
    const date = day(7);
    await send({ intent: "set-exercises", templateId: "custom", date, exercises: "pull-up" });
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set());
  });
});

import { describe, expect, it } from "vitest";
import { addDays, localDate } from "~/domain/dates";
import { action, loader } from "~/routes/workout";
import { workoutView } from "~/server/workouts.server";
import { db, post, routeArgs } from "./helpers";

describe("workout route", () => {
  it("loads a named template", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/workout?template=wed-legs-shoulders")));
    expect(data.view.name).toBe("Legs, Shoulders");
    expect(data.view.exercises).toHaveLength(6);
  });

  it("loads Plan B", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/workout?plan=b")));
    expect(data.view.kind).toBe("plan-b");
  });

  it("logs a set", async () => {
    await action(
      routeArgs(
        post("http://localhost/workout", {
          intent: "log-set", templateId: "wed-legs-shoulders", position: "0", exerciseId: "leg-press", setNumber: "1", weight: "270", reps: "12", clientId: "set-1",
        }),
      ),
    );
    const view = await workoutView(db(), localDate(), "wed-legs-shoulders");
    expect(view.exercises[0].logged).toEqual([expect.objectContaining({ weight: 270, reps: 12, setNumber: 1 })]);
  });

  it("rejects a set without reps", async () => {
    const res = await action(routeArgs(post("http://localhost/workout", { intent: "log-set", templateId: "wed-legs-shoulders", position: "0", exerciseId: "leg-press", setNumber: "2", weight: "270", reps: "", clientId: "set-2" })));
    expect(res).toEqual({ error: "Enter weight and reps." });
  });

  it("swaps an exercise for today", async () => {
    await action(routeArgs(post("http://localhost/workout", { intent: "swap", templateId: "wed-legs-shoulders", position: "3", to: "single-leg-extension", always: "false" })));
    const view = await workoutView(db(), localDate(), "wed-legs-shoulders");
    expect(view.exercises[3].id).toBe("single-leg-extension");
  });
});

describe("workout route on a past day", () => {
  const yesterday = addDays(localDate(), -1);

  it("opens a past day's workout without the live timer", async () => {
    const data = await loader(routeArgs(new Request(`http://localhost/workout?date=${yesterday}&template=wed-legs-shoulders&from=progress`)));
    expect(data.view.date).toBe(yesterday);
    expect(data.live).toBe(false);
    expect(data.back).toBe("/progress");
  });

  it("never opens a future day", async () => {
    const data = await loader(routeArgs(new Request(`http://localhost/workout?date=${addDays(localDate(), 1)}&template=wed-legs-shoulders`)));
    expect(data.view.date).toBe(localDate());
    expect(data.live).toBe(true);
  });

  it("logs, edits and deletes a set on a past day", async () => {
    const set = { templateId: "wed-legs-shoulders", date: yesterday, position: "0", exerciseId: "leg-press" };
    await action(routeArgs(post("http://localhost/workout", { ...set, intent: "log-set", setNumber: "1", weight: "207", reps: "12", clientId: "late-1" })));
    await action(routeArgs(post("http://localhost/workout", { ...set, intent: "log-set", setNumber: "2", weight: "270", reps: "10", clientId: "late-2" })));
    const [first, second] = (await workoutView(db(), yesterday, "wed-legs-shoulders")).exercises[0].logged;
    expect(first).toEqual(expect.objectContaining({ weight: 207, reps: 12 }));

    await action(routeArgs(post("http://localhost/workout", { ...set, intent: "edit-set", id: String(first.id), weight: "270", reps: "12" })));
    await action(routeArgs(post("http://localhost/workout", { ...set, intent: "delete-set", id: String(second.id) })));
    const logged = (await workoutView(db(), yesterday, "wed-legs-shoulders")).exercises[0].logged;
    expect(logged).toEqual([expect.objectContaining({ setNumber: 1, weight: 270, reps: 12 })]);
  });

  it("refuses a set dated in the future", async () => {
    const res = await action(
      routeArgs(post("http://localhost/workout", { intent: "log-set", templateId: "wed-legs-shoulders", date: addDays(localDate(), 1), position: "0", exerciseId: "leg-press", setNumber: "1", weight: "270", reps: "12", clientId: "future" })),
    );
    expect(res).toEqual({ error: "That day hasn't happened yet." });
  });
});

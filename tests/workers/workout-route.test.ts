import { describe, expect, it } from "vitest";
import { localDate } from "~/domain/dates";
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

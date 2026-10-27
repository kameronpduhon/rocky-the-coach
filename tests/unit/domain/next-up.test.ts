import { describe, expect, it } from "vitest";
import { nextUp, type NextUpDay } from "~/domain/next-up";
import type { Slot } from "~/domain/types";

const TIMES: [Slot, number][] = [["breakfast", 450], ["lunch", 840], ["snack", 930], ["dinner", 1110], ["dessert", 1200]];
const slots = (eaten: Slot[] = []) => TIMES.map(([slot, minutes]) => ({ slot, minutes, eaten: eaten.includes(slot) }));
const liftDay = (minutes: number, extra: Partial<NextUpDay> = {}): NextUpDay => ({
  hasPlan: true,
  minutes,
  checkInOpen: false,
  slots: slots(),
  workout: { templateId: "wed-legs-shoulders", started: false, finished: false },
  steps: 1000,
  stepGoal: 8500,
  ...extra,
});

describe("nextUp", () => {
  it("on a lift day morning shows breakfast until it is eaten, then the lift", () => {
    expect(nextUp(liftDay(8 * 60))).toEqual({ kind: "meal", slot: "breakfast" });
    expect(nextUp(liftDay(9 * 60, { slots: slots(["breakfast"]) }))).toEqual({ kind: "workout", templateId: "wed-legs-shoulders", started: false });
  });

  it("keeps a started workout current past 2pm, and drops one never started at 2pm", () => {
    const after = { slots: slots(["breakfast"]) };
    expect(nextUp(liftDay(15 * 60, { ...after, workout: { templateId: "wed-legs-shoulders", started: true, finished: false } }))).toEqual({ kind: "workout", templateId: "wed-legs-shoulders", started: true });
    expect(nextUp(liftDay(14 * 60, after))).toEqual({ kind: "meal", slot: "lunch" });
  });

  it("moves past a finished workout", () => {
    expect(nextUp(liftDay(13 * 60, { slots: slots(["breakfast"]), workout: { templateId: "wed-legs-shoulders", started: true, finished: true } }))).toEqual({ kind: "meal", slot: "lunch" });
  });

  it("lets a meal's window close when the next slot begins", () => {
    expect(nextUp(liftDay(15 * 60 + 40, { workout: null }))).toEqual({ kind: "meal", slot: "snack" });
  });

  it("on a rest day evening shows steps when short, then done", () => {
    const allEaten = slots(["breakfast", "lunch", "snack", "dinner", "dessert"]);
    expect(nextUp(liftDay(21 * 60, { workout: null, slots: allEaten, steps: 6000 }))).toEqual({ kind: "steps", left: 2500 });
    expect(nextUp(liftDay(21 * 60, { workout: null, slots: allEaten, steps: 9000 }))).toEqual({ kind: "done" });
  });

  it("on a Sunday evening shows the check-in first", () => {
    expect(nextUp(liftDay(17 * 60 + 30, { workout: null, checkInOpen: true }))).toEqual({ kind: "check-in" });
  });

  it("without a plan says the plan is on the way", () => {
    expect(nextUp(liftDay(9 * 60, { hasPlan: false }))).toEqual({ kind: "no-plan" });
  });
});

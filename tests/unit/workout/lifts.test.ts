import { describe, expect, it } from "vitest";
import { plan } from "~/content";
import { CUSTOM_WORKOUT } from "~/domain/types";
import type { Row } from "~/sync/tables";
import { addLifts, choiceLabel, dropLift, resolveLifts, swapForGood, swapOptions, swapToday, titleLines, undoSwap, workoutMinutes, workoutTitle } from "~/workout/lifts";

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const LEGS = "wed-legs-shoulders";
const WED = "2026-10-28";
const base = resolveLifts(rowsOf({}), null, LEGS, WED);

describe("lift lists", () => {
  it("follows the template and its always-swaps until the day has its own list", () => {
    expect(base).toHaveLength(6);
    expect(base[5]).toEqual({ position: 5, exercise: "cable-lateral-raise", repMin: 10, repMax: 15, from: "plan" });
    const overridden = resolveLifts(rowsOf({ exercise_overrides: [{ template_id: LEGS, position: 3, exercise_id: "single-leg-extension" }] }), null, LEGS, WED);
    expect(overridden[3].exercise).toBe("single-leg-extension");
    const own = [{ position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" }];
    expect(resolveLifts(rowsOf({}), { lifts: JSON.stringify(own) }, LEGS, WED)).toEqual(own);
    expect(resolveLifts(rowsOf({}), null, CUSTOM_WORKOUT, WED)).toEqual([]);
  });

  it("swaps for today, and undo or swapping back restores the plan lift", () => {
    const swapped = swapToday(base, 5, "dumbbell-lateral-raise");
    expect(swapped[5]).toEqual({ position: 5, exercise: "dumbbell-lateral-raise", repMin: 10, repMax: 15, from: "swap", replaces: "cable-lateral-raise" });
    expect(undoSwap(swapped, 5)[5]).toEqual(base[5]);
    expect(swapToday(swapped, 5, "cable-lateral-raise")[5]).toEqual(base[5]);
    expect(swapForGood(swapped, 5, "seated-lateral-raise")[5]).toEqual({ position: 5, exercise: "seated-lateral-raise", repMin: 10, repMax: 15, from: "plan" });
  });

  it("adds lifts from 100 up and skips without renumbering", () => {
    const added = addLifts(base, ["hammer-curl", "hammer-curl", "leg-press"]);
    expect(added.slice(6)).toEqual([{ position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" }]);
    const twice = addLifts(added, ["dumbbell-curl"]);
    expect(twice.at(-1)!.position).toBe(101);
    expect(dropLift(twice, 1).map((l) => l.position)).toEqual([0, 2, 3, 4, 5, 100, 101]);
  });

  it("offers same-muscle swaps that aren't already in the list", () => {
    const ids = swapOptions(base, 5).map((e) => e.id);
    expect(ids).toContain("dumbbell-lateral-raise");
    expect(ids).not.toContain("cable-lateral-raise");
  });

  it("names workouts for posters and the picker, and estimates their length", () => {
    expect(titleLines(workoutTitle(LEGS))).toEqual(["Legs.", "Shoulders."]);
    expect(titleLines(workoutTitle(plan.planB))).toEqual(["Short.", "Home."]);
    expect([LEGS, "mon-chest-back-arms", plan.planB, CUSTOM_WORKOUT].map(choiceLabel)).toEqual(["Legs, shoulders", "Chest, back, arms", "Short, home", "Your own"]);
    expect(workoutMinutes(12)).toBe(45);
    expect(workoutMinutes(14)).toBe(55);
  });
});

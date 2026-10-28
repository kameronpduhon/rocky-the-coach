import { describe, expect, it } from "vitest";
import { describeRejection, runMutation, type MutationContext } from "~/sync/mutators";
import type { Row } from "~/sync/tables";
import { MemoryTx } from "~/sync/tx";
import { BOWL, checkInRow, SHOULDER, weekThree, type Tables } from "../checkin/fixture";

const SUNDAY: MutationContext = { now: "2026-10-25T23:05:00.000Z", today: "2026-10-25" };
const run = (tx: MemoryTx, name: string, args: unknown, c = SUNDAY) => runMutation(tx, name, args, c);

describe("logWaist", () => {
  it("saves inches to two decimals for a day, and replaces that day's entry", async () => {
    const tx = new MemoryTx(new Map());
    await run(tx, "logWaist", { date: "2026-10-25", inches: 35.456 });
    expect(await tx.get("waist_logs", "2026-10-25")).toEqual({ date: "2026-10-25", inches: 35.46 });
    await run(tx, "logWaist", { date: "2026-10-25", inches: 35.5 });
    expect(await tx.scan("waist_logs")).toEqual([{ date: "2026-10-25", inches: 35.5 }]);
  });

  it("refuses a future day and a number outside 20 to 60", async () => {
    const tx = new MemoryTx(new Map());
    await expect(run(tx, "logWaist", { date: "2026-10-26", inches: 35 })).rejects.toThrow("That date is in the future.");
    await expect(run(tx, "logWaist", { date: "2026-10-25", inches: 61 })).rejects.toThrow();
    await expect(run(tx, "logWaist", { date: "2026-10-25", inches: 19.9 })).rejects.toThrow();
  });
});

describe("checkGrocery", () => {
  it("checks and unchecks a food for a week", async () => {
    const tx = new MemoryTx(new Map());
    await run(tx, "checkGrocery", { week: "2026-10-26", food: "white-rice-cooked", checked: true });
    expect(await tx.get("grocery_checks", "2026-10-26|white-rice-cooked")).toEqual({ week_start: "2026-10-26", food_id: "white-rice-cooked" });
    await run(tx, "checkGrocery", { week: "2026-10-26", food: "white-rice-cooked", checked: false });
    expect(await tx.scan("grocery_checks")).toEqual([]);
  });

  it("refuses a food not in the list and a week that isn't a Monday", async () => {
    const tx = new MemoryTx(new Map());
    await expect(run(tx, "checkGrocery", { week: "2026-10-26", food: "unicorn", checked: true })).rejects.toThrow("That food isn't in the list.");
    await expect(run(tx, "checkGrocery", { week: "2026-10-27", food: "butter", checked: true })).rejects.toThrow("That week doesn't start on a Monday.");
    expect(describeRejection("checkGrocery", "That food isn't in the list.")).toBe("Grocery check didn't save. That food isn't in the list.");
    expect(describeRejection("logWaist", "That date is in the future.")).toBe("Waist didn't save. That date is in the future.");
  });
});

/** A phone holding week three: the store, as MemoryTx keeps it. */
function phone(t: Tables = weekThree()): MemoryTx {
  const tx = new MemoryTx(new Map());
  for (const [table, rows] of Object.entries(t)) for (const r of rows) tx.put(table, r);
  return tx;
}

const AT = "2026-10-25T23:00:00.000Z"; // Sunday Oct 25, 6pm in Chicago.
const finish = (over: Row = {}) => ({
  week: "2026-10-19",
  at: AT,
  pick: "calories",
  hunger: "fine",
  energy: "high",
  sleep: "fine",
  rest: [BOWL],
  lifts: [
    { exercise: SHOULDER, plan: "drop" },
    { exercise: "pec-deck", plan: "drop" },
  ],
  ...over,
});
const nextWeek = async (tx: MemoryTx) => (await tx.scan("planned_meals")).filter((r) => (r.date as string) >= "2026-10-26" && (r.date as string) <= "2026-11-01");

describe("finishCheckIn", () => {
  it("writes Monday's targets, the row, the rests, the drops and next week's meals", async () => {
    const tx = phone();
    await run(tx, "finishCheckIn", finish());
    // Week three's settling cut: 2,300 cal and the ramped 7,500 steps. Protein stays 180.
    expect(await tx.get("targets", "2026-10-26")).toEqual({ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 7500 });
    const row = (await tx.get("check_ins", "2026-10-19"))!;
    expect(row).toMatchObject({ avg_weight: 205.1, change: -0.4, adherence: 4, burn: 2680, burn_state: "settling", intake_avg: 2400, tracked_days: 6, hunger: "fine", energy: "high", sleep: "fine", completed_at: AT });
    expect(JSON.parse(row.outcome as string)).toMatchObject({
      pick: "calories",
      rest: [BOWL],
      // The pec deck isn't stuck, so its drop is saved as a hold.
      lifts: [
        { exercise: SHOULDER, plan: "drop" },
        { exercise: "pec-deck", plan: "hold" },
      ],
      call: { kind: "cut", calories: { kcal: 2300, stepGoal: 7500 }, burn: 2680 },
    });
    expect(await tx.get("meal_state", BOWL)).toEqual({ slug: BOWL, photo_key: null, rested_until: "2026-11-08" });
    expect(await tx.get("lift_drops", SHOULDER)).toEqual({ exercise_id: SHOULDER, weight_lb: 40, from_date: "2026-10-26", created_at: SUNDAY.now });
    expect(await tx.get("lift_drops", "pec-deck")).toBeNull();
    const week = await nextWeek(tx);
    expect(week).toHaveLength(35);
    // The bowl now rests, and salmon still rests until Nov 3.
    expect(week.some((r) => r.meal_slug === BOWL || r.meal_slug === "salmon-and-rice")).toBe(false);
  });

  it("keeps next week's slots already eaten or swapped, finished on Monday morning", async () => {
    const t = weekThree();
    t.planned_meals = [
      { date: "2026-10-26", slot: "breakfast", meal_slug: "steak-and-eggs", swapped: 0 },
      { date: "2026-10-26", slot: "dinner", meal_slug: BOWL, swapped: 1 },
    ];
    t.meal_logs.push({ client_id: "m-mon", date: "2026-10-26", slot: "breakfast", meal_slug: "steak-and-eggs", name: "Steak and eggs", category: "planned", kcal: 600, protein_g: 50, relaxed: 0, portions: 1, logged_at: "2026-10-26T12:40:00Z" });
    const tx = phone(t);
    // Monday Oct 26, 8am: the window is still open for week three.
    await run(tx, "finishCheckIn", finish({ at: "2026-10-26T13:00:00.000Z", rest: [BOWL, "steak-and-eggs"] }), { now: "2026-10-26T13:05:00.000Z", today: "2026-10-26" });
    const week = await nextWeek(tx);
    expect(week).toHaveLength(35);
    expect(await tx.get("planned_meals", "2026-10-26|breakfast")).toMatchObject({ meal_slug: "steak-and-eggs", swapped: 0 });
    expect(await tx.get("planned_meals", "2026-10-26|dinner")).toMatchObject({ meal_slug: BOWL, swapped: 1 });
    // Both now rest, so the kept slots are the only places they appear.
    const kept = (r: Row) => r.date === "2026-10-26" && (r.slot === "breakfast" || r.slot === "dinner");
    expect(week.filter((r) => !kept(r)).some((r) => r.meal_slug === BOWL || r.meal_slug === "steak-and-eggs")).toBe(false);
  });

  it("refuses a closed window, a week the window doesn't name, and a time out of bounds", async () => {
    const tx = phone();
    const tuesday = { now: "2026-10-27T18:00:00.000Z", today: "2026-10-27" };
    await expect(run(tx, "finishCheckIn", finish({ at: tuesday.now }), tuesday)).rejects.toThrow("That week's check-in has closed.");
    await expect(run(tx, "finishCheckIn", finish({ week: "2026-10-12" }))).rejects.toThrow("That week's check-in has closed.");
    await expect(run(tx, "finishCheckIn", finish({ at: "2026-10-25T23:15:00.000Z" }))).rejects.toThrow("That time is in the future.");
    await expect(run(tx, "finishCheckIn", finish({ at: "2026-10-22T23:00:00.000Z" }))).rejects.toThrow("That time is too long ago.");
    expect(await tx.scan("check_ins")).toEqual([]);
  });

  it("replaces the first finish until Monday 3am, then refuses", async () => {
    const tx = phone();
    await run(tx, "finishCheckIn", finish());
    // Sunday 9pm: walk instead, rest nothing, and hold the shoulder press.
    const evening = { now: "2026-10-26T02:05:00.000Z", today: "2026-10-25" };
    await run(tx, "finishCheckIn", finish({ at: "2026-10-26T02:00:00.000Z", pick: "steps", hunger: "high", rest: [], lifts: [{ exercise: SHOULDER, plan: "hold" }] }), evening);
    expect(await tx.get("targets", "2026-10-26")).toEqual({ effective_from: "2026-10-26", kcal: 2400, protein_g: 180, step_goal: 8000 });
    expect(await tx.get("meal_state", BOWL)).toMatchObject({ rested_until: null });
    expect(await tx.get("lift_drops", SHOULDER)).toBeNull();
    const row = (await tx.get("check_ins", "2026-10-19"))!;
    expect(row).toMatchObject({ hunger: "high", completed_at: AT });
    expect(JSON.parse(row.outcome as string)).toMatchObject({ pick: "steps", rest: [] });
    // Monday 4am: the new week has started.
    const monday = { now: "2026-10-26T09:05:00.000Z", today: "2026-10-26" };
    await expect(run(tx, "finishCheckIn", finish({ at: "2026-10-26T09:00:00.000Z" }), monday)).rejects.toThrow("That check-in is already finished.");
    expect(describeRejection("finishCheckIn", "That check-in is already finished.")).toBe("Check-in didn't save. That check-in is already finished.");
  });

  it("falls back to calories when steps are picked and the call has no walking option", async () => {
    const tx = phone();
    // Sunday Oct 18: week two holds, so there is no walking pick. No steps were logged that week, so no ramp.
    await run(tx, "finishCheckIn", finish({ week: "2026-10-12", at: "2026-10-18T23:00:00.000Z", pick: "steps", rest: [], lifts: [] }), { now: "2026-10-18T23:05:00.000Z", today: "2026-10-18" });
    expect(await tx.get("targets", "2026-10-19")).toEqual({ effective_from: "2026-10-19", kcal: 2400, protein_g: 180, step_goal: 7000 });
    expect(JSON.parse((await tx.get("check_ins", "2026-10-12"))!.outcome as string)).toMatchObject({ pick: "calories", call: { kind: "hold" } });
  });

  it("makes walking the pick after two hungry Sundays", async () => {
    const t = weekThree();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" })];
    const tx = phone(t);
    await run(tx, "finishCheckIn", finish({ hunger: "high", pick: "steps" }));
    expect(await tx.get("targets", "2026-10-26")).toMatchObject({ kcal: 2400, step_goal: 8000 });
    expect(JSON.parse((await tx.get("check_ins", "2026-10-19"))!.outcome as string)).toMatchObject({ pick: "steps", call: { pick: "steps", hungry: true } });
  });
});

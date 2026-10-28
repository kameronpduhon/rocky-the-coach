import { describe, expect, it } from "vitest";
import { describeRejection, runMutation, type MutationContext } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

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

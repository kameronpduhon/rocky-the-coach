import { describe, expect, it } from "vitest";
import { COACH_NAME } from "~/brand";
import { describeRejection, runMutation, type MutationContext } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

const ctx: MutationContext = { now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" };
const fresh = () => new MemoryTx(new Map());
const run = (tx: MemoryTx, name: string, args: unknown) => runMutation(tx, name, args, ctx);
const FULL = `${COACH_NAME} knows 30 things. Forget one first.`;

describe("the AI switch and the voice", () => {
  it("setAi keeps the voice, and setVoice keeps the switch, on the phone's whole-row copy", async () => {
    const tx = fresh();
    await run(tx, "setAi", { on: false });
    expect(await tx.get("profile", "me")).toEqual({ id: "me", voice: "corner", ai: 0 });
    await run(tx, "setVoice", { voice: "plain" });
    expect(await tx.get("profile", "me")).toEqual({ id: "me", voice: "plain", ai: 0 });
    await run(tx, "setAi", { on: true });
    expect(await tx.get("profile", "me")).toEqual({ id: "me", voice: "plain", ai: 1 });
  });
});

describe("what Rocky knows", () => {
  it("remembers a fact trimmed, once per client id, and marks the ones from a proposal as dated", async () => {
    const tx = fresh();
    await run(tx, "rememberFact", { clientId: "f-1", text: "  No squats or lunges.  ", dated: false });
    await run(tx, "rememberFact", { clientId: "f-1", text: "Pushed twice", dated: false });
    await run(tx, "rememberFact", { clientId: "f-2", text: "Left shoulder sore", dated: true });
    expect(await tx.scan("facts")).toEqual([
      { client_id: "f-1", text: "No squats or lunges.", dated: 0, created_at: ctx.now, updated_at: ctx.now },
      { client_id: "f-2", text: "Left shoulder sore", dated: 1, created_at: ctx.now, updated_at: ctx.now },
    ]);
  });

  it("refuses an empty fact, one past 200 characters, and a 31st", async () => {
    const tx = fresh();
    await expect(run(tx, "rememberFact", { clientId: "f-x", text: "   ", dated: false })).rejects.toThrow("A fact is 1 to 200 characters.");
    await expect(run(tx, "rememberFact", { clientId: "f-x", text: "x".repeat(201), dated: false })).rejects.toThrow("A fact is 1 to 200 characters.");
    for (let i = 0; i < 30; i++) await run(tx, "rememberFact", { clientId: `f-${i}`, text: `Fact ${i}`, dated: false });
    await expect(run(tx, "rememberFact", { clientId: "f-30", text: "One more", dated: false })).rejects.toThrow(FULL);
    expect(describeRejection("rememberFact", FULL)).toBe(`Fact didn't save. ${FULL}`);
  });

  it("edits a fact, forgets it when the text is emptied, and forgets by key", async () => {
    const tx = fresh();
    await run(tx, "rememberFact", { clientId: "f-1", text: "Left shoulder sore", dated: true });
    await runMutation(tx, "editFact", { key: "f-1", text: " Left shoulder sore, no overhead pressing " }, { ...ctx, now: "2026-10-28T16:00:00.000Z" });
    expect(await tx.get("facts", "f-1")).toEqual({
      client_id: "f-1",
      text: "Left shoulder sore, no overhead pressing",
      dated: 1,
      created_at: ctx.now,
      updated_at: "2026-10-28T16:00:00.000Z",
    });
    await run(tx, "editFact", { key: "f-1", text: "  " });
    expect(await tx.get("facts", "f-1")).toBeNull();
    await expect(run(tx, "editFact", { key: "f-1", text: "Back again" })).rejects.toThrow("That fact isn't saved.");
    await run(tx, "rememberFact", { clientId: "f-2", text: "No squats", dated: false });
    await run(tx, "forgetFact", { key: "f-2" });
    expect(await tx.scan("facts")).toEqual([]);
  });
});

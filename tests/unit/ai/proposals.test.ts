import { describe, expect, it } from "vitest";
import { checkProposals, type Proposal, type RawProposal } from "~/ai/proposals";

const LEGS = "wed-legs-shoulders";
const PRESS = "seated-dumbbell-shoulder-press";
const RAISE = "seated-lateral-raise";
const NOTE = "My left shoulder is sore, no overhead pressing this week";

const raw = (p: Partial<RawProposal>): RawProposal => ({ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: null, ...p });
const SWAP: Proposal = { kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" };
const MOVE: Proposal = { kind: "move", from: "2026-10-28", to: "2026-10-29" };
const FACT: Proposal = { kind: "fact", text: "Left shoulder sore" };

describe("checkProposals (the Worker, against the content)", () => {
  it("keeps proposals naming a plan template, library exercises and real dates, trimming a fact", () => {
    expect(
      checkProposals(
        [
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-10-29" }),
          raw({ kind: "fact", text: "  Left shoulder sore  " }),
        ],
        NOTE,
        true,
      ),
    ).toEqual([SWAP, MOVE, FACT]);
  });

  it("drops a non-library exercise, an unknown template, a same-exercise swap, a swap with no scope, and a bad move", () => {
    expect(
      checkProposals(
        [
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "landmine-press", scope: "week" }),
          raw({ kind: "swap", templateId: "sat-arms", replaces: PRESS, exercise: RAISE, scope: "always" }),
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: PRESS, scope: "always" }),
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: null }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-02-30" }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-10-28" }),
        ],
        NOTE,
        true,
      ),
    ).toEqual([]);
  });

  it("drops a fact with a number the person didn't type, or past 200 characters, and keeps one with a typed number", () => {
    expect(checkProposals([raw({ text: "Keep walks under 30 minutes" })], NOTE, true)).toEqual([]);
    expect(checkProposals([raw({ text: "x".repeat(201) })], NOTE, true)).toEqual([]);
    expect(checkProposals([raw({ text: "Feet hurt after 45 minutes" })], "My feet hurt after 45 minutes of walking", true)).toEqual([{ kind: "fact", text: "Feet hurt after 45 minutes" }]);
  });

  it("keeps at most three, and only facts for someone with no plan", () => {
    const facts = ["Sore shoulder", "Bad knee", "Short on sleep", "Travelling Thursday"].map((text) => raw({ text }));
    expect(checkProposals(facts, NOTE, true)).toHaveLength(3);
    expect(
      checkProposals([raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" }), raw({ kind: "move", from: "2026-10-28", to: "2026-10-29" }), raw({ text: "Left shoulder sore" })], NOTE, false),
    ).toEqual([FACT]);
  });
});

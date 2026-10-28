// Tell Rocky's proposals (spec section 4, "Proposals"): the shape the model fills, and the Worker's checks against the
// content. Task 3 adds the phone's side. Pure: the Worker, the phone and the tests all run it.
import { z } from "zod";
import { exercises, plan } from "~/content";
import { isISODate } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { FACT_MAX } from "./facts";
import { readNumbers } from "./numbers";

/** One proposal as the model writes it: flat, with nulls for the fields a kind doesn't use, so one schema fits all three. */
export const RawProposal = z.object({
  kind: z.enum(["swap", "move", "fact"]),
  templateId: z.string().nullable(),
  replaces: z.string().nullable(),
  exercise: z.string().nullable(),
  /** A swap's reach: "week" for a temporary note, "always" for a lasting preference. */
  scope: z.enum(["week", "always"]).nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  text: z.string().nullable(),
});
export type RawProposal = z.infer<typeof RawProposal>;

/** Tell Rocky's structured output. The list is checked and cut to MAX_PROPOSALS here, not by the schema. */
export const TellReply = z.object({ proposals: z.array(RawProposal) });
export type TellReply = z.infer<typeof TellReply>;

export type Scope = "week" | "always";

export type Proposal =
  | { kind: "swap"; templateId: string; replaces: string; exercise: string; scope: Scope }
  | { kind: "move"; from: ISODate; to: ISODate }
  | { kind: "fact"; text: string };

export const MAX_PROPOSALS = 3;

function contentCheck(p: RawProposal, note: string, hasPlan: boolean): Proposal | null {
  if (p.kind === "fact") {
    const text = p.text?.trim() ?? "";
    if (!text || text.length > FACT_MAX) return null;
    // A fact may only carry numbers the person typed: never a number the model made up.
    const typed = new Set(readNumbers(note));
    return readNumbers(text).every((n) => typed.has(n)) ? { kind: "fact", text } : null;
  }
  if (!hasPlan) return null;
  if (p.kind === "swap") {
    const { templateId, replaces, exercise, scope } = p;
    if (!templateId || !(templateId in plan.templates) || !scope) return null;
    if (!replaces || !exercise || !exercises.has(replaces) || !exercises.has(exercise) || replaces === exercise) return null;
    return { kind: "swap", templateId, replaces, exercise, scope };
  }
  if (!isISODate(p.from) || !isISODate(p.to) || p.from === p.to) return null;
  return { kind: "move", from: p.from, to: p.to };
}

/** The Worker's checks (spec section 4, "Checks"). A proposal that fails is dropped without a word; then at most 3. */
export function checkProposals(raw: RawProposal[], note: string, hasPlan: boolean): Proposal[] {
  return raw
    .map((p) => contentCheck(p, note, hasPlan))
    .filter((p): p is Proposal => p !== null)
    .slice(0, MAX_PROPOSALS);
}

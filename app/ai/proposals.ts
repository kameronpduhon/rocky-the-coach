// Tell Rocky's proposals (spec section 4, "Proposals"): the shape the model fills, the Worker's checks against the
// content, the context the phone sends, the phone's checks against its copy, each card's copy, and what Accept runs.
// Pure: the Worker, the phone and the tests all run it.
import { z } from "zod";
import { COACH_NAME } from "~/brand";
import { exercises, plan } from "~/content";
import { templateFor, type Moves } from "~/domain/calendar";
import { addDays, isISODate, weekAheadEnd, weekStart, weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import type { Mutate } from "~/workout/actions";
import { resolveLifts, swapToday, workoutTitle, type Lift } from "~/workout/lifts";
import { doneDates, sessionKey, type Rows } from "~/workout/sessions";
import { FACT_LIMIT, FACT_MAX } from "./facts";
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

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CONTEXT_DAYS = 8;

const dayName = (d: ISODate) => DAY[weekday(d)];

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

const movesOf = (rows: Rows): Moves => Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
const sessionOn = (rows: Rows, d: ISODate): Row | null => rows("workout_sessions").find((r) => r.date === d) ?? null;

export interface TellDay {
  date: ISODate;
  weekday: string;
  /** The workout's name, or "rest". */
  workout: string;
  templateId: string | null;
  logged: boolean;
}

export interface TellContext {
  days: TellDay[];
  /** Each listed template's current lifts by position, with "always" swaps applied, as the Plan screen shows them. */
  templates: Record<string, string[]>;
}

/** What the phone tells the model about the plan (spec section 4, "What the model is given"). Nothing without a plan. */
export function tellContext(rows: Rows, today: ISODate, hasPlan: boolean): TellContext {
  if (!hasPlan) return { days: [], templates: {} };
  const moves = movesOf(rows);
  const done = doneDates(rows, today);
  const days = Array.from({ length: CONTEXT_DAYS }, (_, i) => addDays(today, i)).map((date): TellDay => {
    const templateId = templateFor(plan, date, moves);
    return { date, weekday: dayName(date), workout: templateId ? workoutTitle(templateId) : "rest", templateId, logged: done.has(date) };
  });
  const ids = [...new Set(days.map((d) => d.templateId).filter((id): id is string => id !== null))];
  return { days, templates: Object.fromEntries(ids.map((id) => [id, resolveLifts(rows, null, id, today).map((l) => l.exercise)])) };
}

/** A day a this-week swap changes: its workout (saved already, or not yet) and its list with the lift's place. */
export interface WeekDay {
  date: ISODate;
  templateId: string;
  /** The saved workout's key; null when Accept has to plan it first. */
  workout: string | null;
  lifts: Lift[];
  position: number;
}

/** A saved workout with its own list (a this-week swap) that a move takes along to the other day. */
export interface Carry {
  date: ISODate;
  templateId: string;
  lifts: Lift[];
}

export type Accept =
  | { kind: "swapAlways"; templateId: string; position: number; exercise: string }
  | { kind: "swapWeek"; exercise: string; days: WeekDay[] }
  | { kind: "move"; a: ISODate; b: ISODate; carry: Carry[] }
  | { kind: "fact"; text: string };

export interface ProposalCard {
  id: string;
  proposal: Proposal;
  /** False once an earlier Accept or a sync has left the card nothing to act on: it can't be accepted. */
  fits: boolean;
  /** "This week only" or "From now on" on a swap. */
  scope: string | null;
  title: string;
  sub: string;
  /** The one muted line the card collapses to after Accept. */
  done: string;
  accept: Accept;
}

/** Today through the end of the week ahead: each day whose workout hasn't started and has the lift. */
function weekDays(rows: Rows, today: ISODate, exercise: string): WeekDay[] {
  const moves = movesOf(rows);
  const done = doneDates(rows, today);
  const out: WeekDay[] = [];
  for (let d = today; d <= weekAheadEnd(today); d = addDays(d, 1)) {
    const session = sessionOn(rows, d);
    if (done.has(d) || session?.started_at || session?.ended_at) continue;
    const templateId = (session?.template_id as string | undefined) ?? templateFor(plan, d, moves);
    if (!templateId || !(templateId in plan.templates)) continue;
    const lifts = resolveLifts(rows, session, templateId, d);
    const lift = lifts.find((l) => l.exercise === exercise);
    if (lift) out.push({ date: d, templateId, workout: session ? sessionKey(session) : null, lifts, position: lift.position });
  }
  return out;
}

/** The next day, from today, that the template is on and isn't done. */
function nextDayOf(rows: Rows, today: ISODate, templateId: string): ISODate | null {
  const moves = movesOf(rows);
  const done = doneDates(rows, today);
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    if (templateFor(plan, d, moves) === templateId && !done.has(d)) return d;
  }
  return null;
}

function cardFor(rows: Rows, p: Proposal, today: ISODate, hasPlan: boolean): Omit<ProposalCard, "id" | "proposal" | "fits"> | null {
  if (p.kind === "fact") {
    if (rows("facts").length >= FACT_LIMIT) return null;
    return { scope: null, title: `Remember: ${p.text} (${monthDay(today)})`, sub: `Goes in What ${COACH_NAME} knows. Forget it there any time.`, done: "Remembered.", accept: { kind: "fact", text: p.text } };
  }
  if (!hasPlan) return null;
  if (p.kind === "swap") {
    const title = `Swap ${exercises.get(p.replaces)!.name} for ${exercises.get(p.exercise)!.name}`;
    if (p.scope === "week") {
      const days = weekDays(rows, today, p.replaces);
      if (!days.length) return null;
      const on = days.map((d) => `${workoutTitle(d.templateId)} on ${dayName(d.date)}, ${monthDay(d.date)}`).join(" and ");
      return { scope: "This week only", title, sub: `${on}. Next week goes back to normal.`, done: "Swapped.", accept: { kind: "swapWeek", exercise: p.exercise, days } };
    }
    // The template's current lift at some place; that place is what swapAlways gets.
    const lift = resolveLifts(rows, null, p.templateId, today).find((l) => l.exercise === p.replaces);
    if (!lift) return null;
    const next = nextDayOf(rows, today, p.templateId);
    const from = next ? `from ${dayName(next)}, ${monthDay(next)} on` : "from now on";
    return {
      scope: "From now on",
      title,
      sub: `${workoutTitle(p.templateId)}, ${from}. Swap back from the workout any time.`,
      done: "Swapped.",
      accept: { kind: "swapAlways", templateId: p.templateId, position: lift.position, exercise: p.exercise },
    };
  }
  // moveWorkout's own rules, checked here first: the same week, not in the past, neither day logged.
  const moves = movesOf(rows);
  const onFrom = templateFor(plan, p.from, moves);
  const onTo = templateFor(plan, p.to, moves);
  const done = doneDates(rows, today);
  if (!onFrom || weekStart(p.from) !== weekStart(p.to) || p.from < today || p.to < today || done.has(p.from) || done.has(p.to)) return null;
  const trade = onTo ? ` ${dayName(p.to)}'s ${workoutTitle(onTo)} moves to ${dayName(p.from)}.` : "";
  // moveWorkout drops a workout saved but not started, so the day replans from the schedule. One with its own list
  // (a this-week swap accepted a moment ago) is planned again on its new day with that list.
  const carry = [
    [p.from, p.to],
    [p.to, p.from],
  ].flatMap(([d, other]): Carry[] => {
    const session = sessionOn(rows, d);
    const templateId = templateFor(plan, d, moves);
    if (!session?.lifts || session.started_at || session.ended_at || !templateId || session.template_id !== templateId) return [];
    return [{ date: other, templateId, lifts: resolveLifts(rows, session, templateId, d) }];
  });
  return {
    scope: null,
    title: `Move ${dayName(p.from)}'s ${workoutTitle(onFrom)} to ${dayName(p.to)}`,
    sub: `${monthDay(p.from)} to ${monthDay(p.to)}.${trade}`,
    done: "Moved.",
    accept: { kind: "move", a: p.from, b: p.to, carry },
  };
}

/** The cards the sheet shows, just before it shows them. A proposal that no longer fits the phone's copy is dropped. */
export function proposalCards(rows: Rows, proposals: Proposal[], today: ISODate, hasPlan: boolean): ProposalCard[] {
  const cards: ProposalCard[] = [];
  for (const p of proposals) {
    const card = cardFor(rows, p, today, hasPlan);
    if (card) cards.push({ ...card, id: `p${cards.length}`, proposal: p, fits: true });
  }
  return cards;
}

/**
 * The shown cards again, from the store as it is now: after each Accept, and after a sync. Each is rebuilt from its
 * proposal, so it acts on the days as they are now (a swap follows its workout to the day it moved to). One that no
 * longer fits keeps its words and can't be accepted.
 */
export function refreshCards(rows: Rows, cards: ProposalCard[], today: ISODate, hasPlan: boolean): ProposalCard[] {
  return cards.map((c) => {
    const card = cardFor(rows, c.proposal, today, hasPlan);
    return card ? { ...card, id: c.id, proposal: c.proposal, fits: true } : { ...c, fits: false };
  });
}

export const NO_LONGER_FITS = "No longer fits";

export function resultLine(count: number): string {
  if (count === 0) return `${COACH_NAME} has nothing to change for that. Keep it in What ${COACH_NAME} knows?`;
  return count === 1 ? `${COACH_NAME} suggests 1 change. Nothing changes until you accept it.` : `${COACH_NAME} suggests ${count} changes. Nothing changes until you accept one.`;
}

/**
 * Send's label and whether the AI lets it go. While the status check is out it reads Send, disabled; "Needs a signal"
 * waits for the check to fail or the phone to go offline, so it doesn't flash on every open.
 */
export function sendButton(ai: { ready: boolean; checking: boolean }, reading: boolean): { label: string; disabled: boolean } {
  if (ai.ready) return { label: reading ? "Reading" : "Send", disabled: reading };
  return { label: ai.checking ? "Send" : "Needs a signal", disabled: true };
}

export const TELL_FAILED = `${COACH_NAME} couldn't read that just now. Keep it as written?`;

/** Runs an accepted proposal as named changes. False at the first one the rules refuse; the sync notice says why. */
export async function runAccept(a: Accept, mutate: Mutate, newId: () => string = () => crypto.randomUUID(), now: () => Date = () => new Date()): Promise<boolean> {
  if (a.kind === "swapAlways") return mutate("swapAlways", { templateId: a.templateId, position: a.position, exercise: a.exercise });
  if (a.kind === "fact") return mutate("rememberFact", { clientId: newId(), text: a.text, dated: true });
  if (a.kind === "move") {
    if (!(await mutate("moveWorkout", { a: a.a, b: a.b }))) return false;
    for (const c of a.carry) {
      const key = newId();
      if (!(await mutate("planWorkout", { clientId: key, date: c.date, templateId: c.templateId, at: now().toISOString(), scheduled: true }))) return false;
      if (!(await mutate("setLifts", { workout: key, lifts: c.lifts }))) return false;
    }
    return true;
  }
  for (const d of a.days) {
    const key = d.workout ?? newId();
    if (!d.workout && !(await mutate("planWorkout", { clientId: key, date: d.date, templateId: d.templateId, at: now().toISOString(), scheduled: true }))) return false;
    if (!(await mutate("setLifts", { workout: key, lifts: swapToday(d.lifts, d.position, a.exercise) }))) return false;
  }
  return true;
}

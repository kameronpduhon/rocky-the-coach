// Rocky's take, AI-written (spec section 2): the lines the model is given, the check its text must pass, the hash a
// stored take is keyed by, and which take the card shows. Pure: the phone and the Worker both run it.
import type { CheckInDigest } from "~/checkin/digest";
import type { Take } from "~/checkin/take";
import { weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { allowedNumbers, strayNumbers } from "./numbers";

export type Voice = "corner" | "plain";
export type TakeCheck = "ok" | "numbers" | "length" | "characters";

export const TAKE_MAX_SENTENCES = 4;
export const TAKE_MAX_CHARS = 420;

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (n: number) => n.toLocaleString("en-US");
const count = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
/** Inches, at most two decimals: "0.25", "35.5". */
const inches = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

/** "Oct 19 to 25", or "Oct 26 to Nov 1" across a month. */
function range(from: ISODate, to: ISODate): string {
  return from.slice(0, 7) === to.slice(0, 7) ? `${monthDay(from)} to ${Number(to.slice(8))}` : `${monthDay(from)} to ${monthDay(to)}`;
}

/** Rocky's pick, as the rules made it. The model may quote it ("I'm trimming 100") but never changes it. */
function callLine(d: CheckInDigest): string {
  const c = d.call;
  if (c.kind === "maintenance") return `The call: maintenance week, ${num(c.maintenanceKcal ?? c.burn)} cal a day`;
  if (c.pick === "steps" && c.steps) {
    const more = c.steps.stepGoal - d.steps.goal;
    return `The call: keep ${num(c.steps.kcal)}, ${more > 0 ? `walk ${num(more)} more, ` : ""}step goal ${num(c.steps.stepGoal)}`;
  }
  const change = c.calories.kcal - c.currentKcal;
  if (change < 0) return `The call: trim ${num(-change)}, from ${num(c.currentKcal)} to ${num(c.calories.kcal)} cal a day from Monday`;
  if (change > 0) return `The call: raise ${num(change)}, from ${num(c.currentKcal)} to ${num(c.calories.kcal)} cal a day from Monday`;
  return `The call: calories hold at ${num(c.calories.kcal)}`;
}

/**
 * The week as short labelled lines (spec section 2, "What the model is given"). A line the digest has no number for is
 * left out. The rule take goes last, so the AI narrates the same win and fix the rules picked.
 */
export function takeLines(d: CheckInDigest, rule: Take): string[] {
  const lines = [`Week ${d.week.number}, ${range(d.week.monday, d.week.sunday)}`, `${d.days.counted} of ${d.days.total} days counted, ${d.days.full} fully on plan`];
  const { trend, change } = d.weight;
  if (trend !== null) {
    const moved = change === null ? "" : Math.abs(change) < 0.05 ? ", steady this week" : `, ${change < 0 ? "down" : "up"} ${Math.abs(change).toFixed(1)} lb this week`;
    lines.push(`Trend weight ${trend.toFixed(1)} lb${moved}`);
  }
  const w = d.waist;
  if (w.now !== null) {
    const moved = w.change === null ? "" : w.change === 0 ? ", no change" : `, ${w.change < 0 ? "down" : "up"} ${inches(w.change)} in`;
    lines.push(`Waist ${inches(w.now)} in${moved}`);
  }
  if (d.protein.avg !== null) lines.push(`Protein averaged ${d.protein.avg} g a day, target ${d.protein.target} g`);
  const low = d.steps.lowDay;
  lines.push(`Steps averaged ${num(d.steps.avg)} a day, goal ${num(d.steps.goal)}${low ? `. Lowest day ${DAY[weekday(low.date)]}, ${num(low.steps)}` : ""}`);
  const l = d.lifts;
  const lifts = [`${count(l.plannedDone + l.extras.length, "session", "sessions")}, ${l.plannedDone} of ${l.planned} planned`];
  if (l.movedUp.length) lifts.push(`${count(l.movedUp.length, "lift", "lifts")} moved up`);
  for (const s of l.stuck) lifts.push(`${s.name} stuck at ${s.top} lb`);
  lines.push(lifts.join(". "));
  const c = d.call;
  lines.push(`Burn estimate ${num(c.burn)} a day${c.state === "settling" && c.steadyBy !== null ? `, settling, steady by week ${c.steadyBy}` : ""}`);
  lines.push(callLine(d), `Written win: ${rule.win}`, `Written fix: ${rule.fix}`, `Written call: ${rule.call}`);
  return lines;
}

/** The take passes only if every rule holds (spec section 2, "The check"). Not retried: a failure shows the rule take. */
export function checkTake(text: string, lines: string[]): TakeCheck {
  if (/[\u2013\u2014]/.test(text) || /\p{Extended_Pictographic}/u.test(text)) return "characters";
  if (/[\r\n]/.test(text) || text.length > TAKE_MAX_CHARS) return "length";
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 1 || sentences.length > TAKE_MAX_SENTENCES) return "length";
  return strayNumbers(text, allowedNumbers(lines)).length ? "numbers" : "ok";
}

/** SHA-256 of the voice and the lines, first 16 hex characters. A new weigh-in or a voice change makes a new one. */
export async function takeHash(lines: string[], voice: Voice): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([voice, ...lines])));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export type TakeView = { kind: "ai"; text: string } | { kind: "waiting" } | { kind: "rule" };

export interface TakeState {
  aiOn: boolean;
  /** Whether the server has a key; null until it has answered. */
  available: boolean | null;
  /** The status ask is still out. */
  checking: boolean;
  online: boolean;
  /** The check-in is open, so a missing take may be written now. */
  writable: boolean;
  /** takeHash of the current lines and voice; null for the moment it takes to work out. */
  hash: string | null;
  /** The week's `takes` row. */
  stored: { text: string; hash: string } | null;
  /** A take the server just returned, before the pull brings its row. */
  fresh: { text: string; hash: string } | null;
  /** The hash a take was asked for on this page, and whether the answer is still coming. */
  asked: { hash: string; pending: boolean } | null;
}

const RULE: TakeView = { kind: "rule" };
const WAITING: TakeView = { kind: "waiting" };

/** Which take the card shows, and whether to ask for one now (spec section 2, "When it is written and shown"). */
export function chooseTake(s: TakeState, lines: string[]): { view: TakeView; ask: boolean } {
  if (!s.aiOn || s.available === false) return { view: RULE, ask: false };
  if (s.available === null) return { view: s.checking ? WAITING : RULE, ask: false };
  if (s.hash === null) return { view: WAITING, ask: false };
  const written = [s.fresh, s.stored].find((t) => t?.hash === s.hash);
  // The same hash would only fetch the same stored text, so a written take that fails here is never re-asked.
  if (written) return { view: checkTake(written.text, lines) === "ok" ? { kind: "ai", text: written.text } : RULE, ask: false };
  if (!s.online || !s.writable) return { view: RULE, ask: false };
  if (s.asked?.hash === s.hash) return { view: s.asked.pending ? WAITING : RULE, ask: false };
  return { view: WAITING, ask: true };
}

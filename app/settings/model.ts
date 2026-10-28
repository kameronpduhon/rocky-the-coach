import { FACT_LIMIT, factsOf } from "~/ai/facts";
import { COACH_NAME } from "~/brand";
import { addDays, formatClock, localDate, localMinutes, TZ } from "~/domain/dates";
import { DEFAULT_REMINDERS, REMINDER_LABEL, type ReminderKind } from "~/domain/reminders";
import type { Row } from "~/sync/tables";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ });

export function daysLabel(days: number[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 1) return days[0] === 0 ? "Sundays" : `${DAY_NAMES[days[0]]}s`;
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export interface ReminderRow {
  kind: ReminderKind;
  label: string;
  days: string;
  enabled: boolean;
  time: string;
}

/** Every reminder in plan order. A saved row overrides its default; a reminder never saved is on at its default time. */
export function reminderRows(rows: Row[]): ReminderRow[] {
  return DEFAULT_REMINDERS.map((d) => {
    const saved = rows.find((r) => r.kind === d.kind);
    return { kind: d.kind, label: REMINDER_LABEL[d.kind], days: daysLabel(d.days), enabled: saved ? Boolean(saved.enabled) : true, time: (saved?.time as string | undefined) ?? d.time };
  });
}

export function voiceOf(rows: Row[]): "corner" | "plain" {
  return rows.find((r) => r.id === "me")?.voice === "plain" ? "plain" : "corner";
}

/** The AI switch. A row the phone pulled before the switch existed has no `ai`, and reads on. */
export function aiOn(rows: Row[]): boolean {
  return rows.find((r) => r.id === "me")?.ai !== 0;
}

export const AI_SWITCH_COPY = `Writes ${COACH_NAME}'s take, reads "Tell ${COACH_NAME}" notes and nutrition labels, and turns a described meal into a plate. Never changes your numbers. Off means written lines only.`;

export interface FactRow {
  key: string;
  /** The fact as saved, for the edit field. */
  text: string;
  /** As the row shows it, with " (Oct 25)" on a dated fact. */
  shown: string;
  /** The × button's label. */
  forget: string;
}

export interface RockySection {
  aiOn: boolean;
  /** Under the switch when the server has no key. */
  setupNote: string | null;
  facts: FactRow[];
  /** The line in place of the list when nothing is known yet. */
  empty: string | null;
  /** At the limit: the AI-off sheet says to forget one first. */
  full: boolean;
}

/** Settings' ROCKY section under the voice picker (spec section 5). `available` is null until the server has answered. */
export function rockySection(profile: Row[], facts: Row[], available: boolean | null): RockySection {
  const rows = factsOf(facts).map((f) => ({
    key: f.key,
    text: f.text,
    shown: f.dated ? `${f.text} (${MONTH_DAY.format(new Date(f.createdAt))})` : f.text,
    forget: `Forget: ${f.text}`,
  }));
  return {
    aiOn: aiOn(profile),
    setupNote: available === false ? `Not set up on this server yet, so ${COACH_NAME} uses written lines.` : null,
    facts: rows,
    empty: rows.length ? null : `Nothing yet. Tell ${COACH_NAME} something worth keeping in mind.`,
    full: rows.length >= FACT_LIMIT,
  };
}

/** When the steps Shortcut last delivered, from the newest steps row. */
export function lastReceived(rows: Row[], now: Date): string | null {
  const latest = rows
    .map((r) => r.updated_at)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort()
    .at(-1);
  if (!latest) return null;
  const at = new Date(latest);
  const day = localDate(at);
  const today = localDate(now);
  const when = day === today ? "today" : day === addDays(today, -1) ? "yesterday" : MONTH_DAY.format(at);
  return `Last received ${when} at ${formatClock(localMinutes(at))}.`;
}

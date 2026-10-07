import { eq } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { notificationsSent, workoutSessions } from "~/db/schema";
import { isRelaxedDay, isTrainingDay } from "~/domain/calendar";
import { localDate, localMinutes, weekStart, weekday } from "~/domain/dates";
import { dueReminders, reminderDef, type ReminderKind } from "~/domain/reminders";
import type { Slot } from "~/domain/types";
import { stepsFor, weighInFor } from "./body.server";
import { checkInDone } from "./checkin.server";
import { datesWithSets } from "./history.server";
import { logsForDate } from "./meals.server";
import { sendToAll, type PushMessage } from "./push.server";
import { movesBetween } from "./schedule.server";
import { reminderSettings } from "./settings.server";
import { targetsFor } from "./targets.server";

const URLS: Record<ReminderKind, string> = {
  "weigh-in": "/",
  breakfast: "/",
  lift: "/workout",
  lunch: "/",
  snack: "/",
  "plan-b": "/workout?plan=b",
  steps: "/",
  dinner: "/",
  "kitchen-closed": "/",
  "check-in": "/check-in",
};

type Sender = (db: Db, message: PushMessage) => Promise<number>;

/** Sends every reminder due at `now` (Chicago time) whose condition still holds. Returns the kinds sent. */
export async function runReminders(db: Db, now: Date, send: Sender = sendToAll): Promise<ReminderKind[]> {
  const date = localDate(now);
  const wd = weekday(date);
  const [logs, weighIn, steps, targets, sessions, setDates, settings, sentRows, checkedIn, moves] = await Promise.all([
    logsForDate(db, date),
    weighInFor(db, date),
    stepsFor(db, date),
    targetsFor(db, date),
    db.select().from(workoutSessions).where(eq(workoutSessions.date, date)).all(),
    datesWithSets(db, date, date),
    reminderSettings(db),
    db.select().from(notificationsSent).where(eq(notificationsSent.date, date)).all(),
    wd === 0 ? checkInDone(db, weekStart(date)) : Promise.resolve(true),
    movesBetween(db, date, date),
  ]);

  let due = dueReminders(
    localMinutes(now),
    {
      weekday: wd,
      trainingDay: isTrainingDay(plan, date, moves),
      weighedIn: weighIn !== null,
      loggedSlots: logs.filter((l) => l.slot).map((l) => l.slot as Slot),
      sessionStarted: sessions.length > 0,
      loggedSetToday: setDates.has(date),
      steps,
      stepGoal: targets.stepGoal,
      checkInDone: checkedIn,
    },
    settings,
    sentRows.map((r) => r.kind as ReminderKind),
  );
  // Holidays never nag. The check-in still matters if one lands on a Sunday.
  if (isRelaxedDay(plan, date)) due = due.filter((k) => k === "check-in");

  const sent: ReminderKind[] = [];
  for (const kind of due) {
    // Claim the send first so two overlapping cron runs never both send it.
    const claimed = await db.insert(notificationsSent).values({ kind, date }).onConflictDoNothing().returning();
    if (claimed.length === 0) continue;
    const def = reminderDef(kind);
    await send(db, { title: def.title, body: def.body, url: URLS[kind], tag: kind });
    sent.push(kind);
  }
  return sent;
}

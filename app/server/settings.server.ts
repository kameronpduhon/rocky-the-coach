import type { Db } from "~/db/client";
import { reminderSettings as table } from "~/db/schema";
import { DEFAULT_REMINDERS, type ReminderKind, type ReminderSetting } from "~/domain/reminders";

export async function reminderSettings(db: Db): Promise<ReminderSetting[]> {
  const rows = await db.select().from(table).all();
  return DEFAULT_REMINDERS.map((d) => {
    const row = rows.find((r) => r.kind === d.kind);
    return { kind: d.kind, enabled: row?.enabled ?? true, time: row?.time ?? d.time };
  });
}

export async function saveReminder(db: Db, s: ReminderSetting): Promise<void> {
  await db.insert(table).values(s).onConflictDoUpdate({ target: table.kind, set: { enabled: s.enabled, time: s.time } });
}

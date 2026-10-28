import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { checkIns } from "~/db/schema";
import type { ISODate } from "~/domain/types";

// The check-in runs on the phone (app/checkin/*) and saves through finishCheckIn. What stays here serves the
// reminders and Today's server reads (checkInDone, checkInWindow).
export { checkInWindow } from "~/domain/checkin";

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

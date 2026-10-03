import { getDb } from "~/db/client";
import { runBackup } from "~/server/backup.server";
import { runReminders } from "~/server/reminders.server";

// Must match the weekly entry in wrangler.jsonc exactly. Cloudflare rejects 0 for Sunday, hence SUN.
export const BACKUP_CRON = "0 9 * * SUN";

export async function runScheduled(env: Env, cron: string, now: Date): Promise<void> {
  try {
    if (cron === BACKUP_CRON) {
      const key = await runBackup(env.DB, env.MEDIA, now);
      console.log(`[cron] backup written to ${key}`);
      return;
    }
    const sent = await runReminders(getDb(env.DB), now);
    if (sent.length) console.log(`[cron] reminders: ${sent.join(", ")}`);
  } catch (err) {
    console.log(`[cron] ${cron} failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

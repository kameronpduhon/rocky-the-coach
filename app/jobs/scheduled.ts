import { getDb } from "~/db/client";
import { runBackup } from "~/server/backup.server";
import { runReminders } from "~/server/reminders.server";
import { allUsers } from "~/server/users.server";

// Must match the weekly entry in wrangler.jsonc exactly. Cloudflare rejects 0 for Sunday, hence SUN.
export const BACKUP_CRON = "0 9 * * SUN";

export async function runScheduled(env: Env, cron: string, now: Date): Promise<void> {
  try {
    const people = await allUsers();
    if (cron === BACKUP_CRON) {
      for (const person of people) {
        console.log(`[cron] backup written to ${await runBackup(env[person.dbBinding], env.MEDIA, now, person.name.toLowerCase())}`);
      }
      console.log(`[cron] backup written to ${await runBackup(env.CORE, env.MEDIA, now, "core")}`);
      return;
    }
    for (const person of people) {
      // Reminders read the plan, so someone without one gets none yet.
      if (!person.planKey) continue;
      const sent = await runReminders(getDb(env[person.dbBinding]), now);
      if (sent.length) console.log(`[cron] reminders for ${person.name}: ${sent.join(", ")}`);
    }
  } catch (err) {
    console.log(`[cron] ${cron} failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

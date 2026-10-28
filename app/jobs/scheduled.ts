import { getDb } from "~/db/client";
import { mealDate, weekStart } from "~/domain/dates";
import { runBackup } from "~/server/backup.server";
import { ensureWeekPlan } from "~/server/meal-plan.server";
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
        // Pull falls back to a full snapshot for anyone whose last pull is older than what is kept.
        await env[person.dbBinding].prepare("DELETE FROM changes WHERE at < ?").bind(new Date(now.getTime() - 30 * 86_400_000).toISOString()).run();
      }
      console.log(`[cron] backup written to ${await runBackup(env.CORE, env.MEDIA, now, "core")}`);
      return;
    }
    for (const person of people) {
      // Reminders and meals read the plan, so someone without one gets neither yet.
      if (!person.planKey) continue;
      const db = getDb(env[person.dbBinding]);
      // Monday's meals exist before anyone opens the app, so the first pull brings them.
      await ensureWeekPlan(db, weekStart(mealDate(now)));
      const sent = await runReminders(db, now);
      if (sent.length) console.log(`[cron] reminders for ${person.name}: ${sent.join(", ")}`);
    }
  } catch (err) {
    console.log(`[cron] ${cron} failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

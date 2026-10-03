export async function runScheduled(_env: Env, cron: string, now: Date): Promise<void> {
  console.log(`[cron] ${cron} at ${now.toISOString()}`);
}

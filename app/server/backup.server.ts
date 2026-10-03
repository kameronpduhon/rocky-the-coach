import { localDate } from "~/domain/dates";

const KEEP = 12;

/** Dumps every app table to `backups/<Chicago date>.json` in R2 and prunes all but the newest 12. */
export async function runBackup(d1: D1Database, bucket: R2Bucket, now: Date): Promise<string> {
  const { results: tables } = await d1
    .prepare(
      "select name from sqlite_master where type = 'table' and substr(name, 1, 7) != 'sqlite_' and substr(name, 1, 4) != '_cf_' and name != 'd1_migrations' order by name",
    )
    .all<{ name: string }>();
  const dump: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    dump[name] = (await d1.prepare(`select * from "${name}"`).all()).results;
  }
  const key = `backups/${localDate(now)}.json`;
  await bucket.put(key, JSON.stringify(dump), { httpMetadata: { contentType: "application/json" } });

  const listed = await bucket.list({ prefix: "backups/" });
  const keys = listed.objects.map((o) => o.key).sort();
  const stale = keys.slice(0, Math.max(0, keys.length - KEEP));
  if (stale.length) await bucket.delete(stale);
  return key;
}

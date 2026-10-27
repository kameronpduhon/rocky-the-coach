import { lastMutationId } from "./push.server";
import { SYNCED, tableDef, type Row } from "./tables";

export type PullResult = {
  version: number;
  lastMutationId: number;
  snapshot: boolean;
  puts: Record<string, Row[]>;
  dels: Record<string, string[]>;
};

// D1 allows 100 bound parameters per statement.
const CHUNK = 90;

/** Everything in one person's database that changed after `since`, or all of it when `since` is 0 or too old. */
export async function processPull(d1: D1Database, since: number, clientId: string): Promise<PullResult> {
  // Read the version first: a write landing during this pull is either included or sent again next time.
  const head = await d1
    .prepare("SELECT (SELECT seq FROM sqlite_sequence WHERE name = 'changes') AS seq, (SELECT MIN(version) FROM changes) AS oldest")
    .first<{ seq: number | null; oldest: number | null }>();
  const version = head?.seq ?? 0;
  const ackedThrough = await lastMutationId(d1, clientId);
  const oldestKept = head?.oldest ?? version + 1;
  const snapshot = since <= 0 || since < oldestKept - 1;

  if (snapshot) {
    const results = await d1.batch(SYNCED.map((t) => d1.prepare(`SELECT * FROM ${t.name}`)));
    const puts: Record<string, Row[]> = {};
    SYNCED.forEach((t, i) => (puts[t.name] = results[i].results as Row[]));
    return { version, lastMutationId: ackedThrough, snapshot: true, puts, dels: {} };
  }

  const changed = (
    await d1
      .prepare("SELECT DISTINCT table_name, row_key FROM changes WHERE version > ? AND version <= ?")
      .bind(since, version)
      .all<{ table_name: string; row_key: string }>()
  ).results;
  const byTable = new Map<string, string[]>();
  for (const c of changed) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.row_key]);

  const puts: Record<string, Row[]> = {};
  const dels: Record<string, string[]> = {};
  for (const [table, keys] of byTable) {
    const def = tableDef(table);
    const found = new Map<string, Row>();
    for (let i = 0; i < keys.length; i += CHUNK) {
      const part = keys.slice(i, i + CHUNK);
      const rows = (
        await d1
          .prepare(`SELECT * FROM ${table} WHERE ${def.keySql("")} IN (${part.map(() => "?").join(", ")})`)
          .bind(...part)
          .all<Row>()
      ).results;
      for (const row of rows) found.set(def.key(row), row);
    }
    // A key whose row is gone was deleted, whatever the log's op says.
    const present = keys.filter((k) => found.has(k));
    const gone = keys.filter((k) => !found.has(k));
    if (present.length) puts[table] = present.map((k) => found.get(k)!);
    if (gone.length) dels[table] = gone;
  }
  return { version, lastMutationId: ackedThrough, snapshot: false, puts, dels };
}

// Prints the trigger migration for synced tables: all of them, or only those named. Run it after changing app/sync/tables.ts:
//   npx tsx scripts/gen-sync-triggers.ts [table ...] > drizzle/<n>_<name>.sql
import { SYNCED } from "../app/sync/tables";

const only = process.argv.slice(2);
const out: string[] = [];
for (const { name, keySql } of SYNCED.filter((t) => only.length === 0 || only.includes(t.name))) {
  const neu = keySql("NEW.");
  const old = keySql("OLD.");
  out.push(
    `DROP TRIGGER IF EXISTS sync_${name}_ins;`,
    `DROP TRIGGER IF EXISTS sync_${name}_upd;`,
    `DROP TRIGGER IF EXISTS sync_${name}_del;`,
    `CREATE TRIGGER sync_${name}_ins AFTER INSERT ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${neu}, 'put'); END;`,
    // A key can change in an update (rare); the old key is then gone from the client's point of view.
    `CREATE TRIGGER sync_${name}_upd AFTER UPDATE ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) SELECT '${name}', ${old}, 'del' WHERE ${old} IS NOT ${neu}; INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${neu}, 'put'); END;`,
    `CREATE TRIGGER sync_${name}_del AFTER DELETE ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${old}, 'del'); END;`,
  );
}
console.log(out.join("\n--> statement-breakpoint\n"));

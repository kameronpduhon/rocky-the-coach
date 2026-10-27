import { tableDef, type Row } from "./tables";
import type { Tx } from "./tx";

/**
 * A Tx over D1. D1 has no interactive transactions, so reads go to the database (overlaid with this Tx's own
 * pending writes) and writes are buffered, then committed with batch(), which is atomic.
 */
export class ServerTx implements Tx {
  readonly statements: D1PreparedStatement[] = [];
  private readonly overlay = new Map<string, Row | null>();

  constructor(private readonly d1: D1Database) {}

  private slot(table: string, key: string) {
    return `${table}\u0000${key}`;
  }

  async get(table: string, key: string): Promise<Row | null> {
    const slot = this.slot(table, key);
    if (this.overlay.has(slot)) return this.overlay.get(slot)!;
    return (await this.d1.prepare(`SELECT * FROM ${table} WHERE ${tableDef(table).keySql("")} = ?`).bind(key).first<Row>()) ?? null;
  }

  async scan(table: string): Promise<Row[]> {
    const def = tableDef(table);
    const rows = new Map<string, Row>();
    for (const row of (await this.d1.prepare(`SELECT * FROM ${table}`).all<Row>()).results) rows.set(def.key(row), row);
    for (const [slot, row] of this.overlay) {
      const [t, key] = slot.split("\u0000");
      if (t !== table) continue;
      if (row === null) rows.delete(key);
      else rows.set(key, row);
    }
    return [...rows.values()];
  }

  put(table: string, row: Row): void {
    const def = tableDef(table);
    this.overlay.set(this.slot(table, def.key(row)), row);
    const columns = Object.keys(row);
    const updates = columns.filter((c) => !def.conflict.includes(c)).map((c) => `${c} = excluded.${c}`);
    const sql =
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})` +
      ` ON CONFLICT (${def.conflict.join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
    this.statements.push(this.d1.prepare(sql).bind(...columns.map((c) => row[c] ?? null)));
  }

  delete(table: string, key: string): void {
    this.overlay.set(this.slot(table, key), null);
    this.statements.push(this.d1.prepare(`DELETE FROM ${table} WHERE ${tableDef(table).keySql("")} = ?`).bind(key));
  }
}

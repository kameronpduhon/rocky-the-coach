import { keyOf, type Row } from "./tables";

/** What a mutator can do to the data. Implemented over the client store (MemoryTx) and over D1 (ServerTx). */
export interface Tx {
  get(table: string, key: string): Promise<Row | null>;
  scan(table: string): Promise<Row[]>;
  put(table: string, row: Row): void;
  delete(table: string, key: string): void;
}

export type Tables = Map<string, Map<string, Row>>;

export class MemoryTx implements Tx {
  constructor(readonly tables: Tables) {}

  private table(name: string): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }

  async get(table: string, key: string) {
    return this.table(table).get(key) ?? null;
  }

  async scan(table: string) {
    return [...this.table(table).values()];
  }

  put(table: string, row: Row) {
    this.table(table).set(keyOf(table, row), row);
  }

  delete(table: string, key: string) {
    this.table(table).delete(key);
  }
}

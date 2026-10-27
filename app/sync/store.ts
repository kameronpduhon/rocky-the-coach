import { runMutation, type MutationContext } from "./mutators";
import { keyOf, SYNC_SCHEMA, type Row } from "./tables";
import { MemoryTx, type Tables } from "./tx";

export interface PendingMutation {
  id: number;
  name: string;
  args: unknown;
}

export interface PullPayload {
  version: number;
  lastMutationId: number;
  snapshot: boolean;
  puts: Record<string, Row[]>;
  dels: Record<string, string[]>;
}

export interface SavedState {
  /** The SYNC_SCHEMA the copy was saved under. Missing on copies saved before W1. */
  schema?: number;
  version: number;
  nextMutationId: number;
  base: Record<string, Row[]>;
  pending: PendingMutation[];
}

const clone = (t: Tables): Tables => new Map([...t].map(([name, rows]) => [name, new Map(rows)]));

/**
 * The phone's copy of one person's data. `base` is what the server last confirmed. `view` is base plus the changes
 * still waiting to be confirmed, replayed in order. Screens read `view`.
 */
export class SyncStore {
  version = 0;
  nextMutationId = 1;
  pending: PendingMutation[] = [];
  /** Goes up on every change, so a screen can memoise work on it. */
  changeCount = 0;
  private base: Tables = new Map();
  private view: Tables = new Map();
  private listeners = new Set<() => void>();
  private snapshots = new Map<string, Row[]>();

  constructor(private readonly context: () => MutationContext) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Rows of one table. The same array is returned until that table changes, so React can compare it cheaply. */
  rows(table: string): Row[] {
    let rows = this.snapshots.get(table);
    if (!rows) this.snapshots.set(table, (rows = [...(this.view.get(table)?.values() ?? [])]));
    return rows;
  }

  /** Applies a change now and queues it for the server. Throws, and queues nothing, if the change is refused. */
  async mutate(name: string, args: unknown): Promise<PendingMutation> {
    const next = clone(this.view);
    await runMutation(new MemoryTx(next), name, args, this.context());
    const m = { id: this.nextMutationId++, name, args };
    this.pending.push(m);
    this.view = next;
    this.changed();
    return m;
  }

  async applyPull(p: PullPayload): Promise<void> {
    if (p.snapshot) this.base = new Map();
    for (const [table, rows] of Object.entries(p.puts)) {
      let t = this.base.get(table);
      if (!t) this.base.set(table, (t = new Map()));
      for (const row of rows) t.set(keyOf(table, row), row);
    }
    for (const [table, keys] of Object.entries(p.dels)) for (const k of keys) this.base.get(table)?.delete(k);
    this.version = p.version;
    this.pending = this.pending.filter((m) => m.id > p.lastMutationId);
    await this.rebase();
  }

  private async rebase(): Promise<void> {
    const next = clone(this.base);
    const tx = new MemoryTx(next);
    for (const m of this.pending) {
      // A waiting change that no longer applies (the server will reject it too) is skipped here, not dropped.
      await runMutation(tx, m.name, m.args, this.context()).catch(() => undefined);
    }
    this.view = next;
    this.changed();
  }

  save(): SavedState {
    const base: Record<string, Row[]> = {};
    for (const [name, rows] of this.base) base[name] = [...rows.values()];
    return { schema: SYNC_SCHEMA, version: this.version, nextMutationId: this.nextMutationId, base, pending: this.pending };
  }

  async restore(s: SavedState): Promise<void> {
    this.nextMutationId = s.nextMutationId;
    this.pending = s.pending;
    // A copy saved before a row-key change would keep rows under keys the server no longer sends. Start over from a
    // snapshot; the waiting changes still replay on top.
    const current = s.schema === SYNC_SCHEMA;
    this.version = current ? s.version : 0;
    this.base = current ? new Map(Object.entries(s.base).map(([name, rows]) => [name, new Map(rows.map((r) => [keyOf(name, r), r]))])) : new Map();
    await this.rebase();
  }

  private changed(): void {
    this.changeCount++;
    this.snapshots.clear();
    for (const fn of this.listeners) fn();
  }
}

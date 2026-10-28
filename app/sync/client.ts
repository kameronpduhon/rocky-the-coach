import { describeRejection, MutationRejected, type MutationContext } from "./mutators";
import { SyncStore, type PendingMutation, type PullPayload, type SavedState } from "./store";

export type Persisted = SavedState & { clientId: string };

export interface Persistence {
  load(): Promise<Persisted | null>;
  save(state: Persisted): Promise<void>;
}

type Reply<T> = { ok: boolean; status: number; result: T };
export interface Transport {
  push(body: { clientId: string; mutations: PendingMutation[] }): Promise<Reply<{ lastMutationId: number; rejected: { id: number; message: string }[] }>>;
  pull(since: number, clientId: string): Promise<Reply<PullPayload>>;
}

export interface SyncStatus {
  waiting: number;
  online: boolean;
  lastSyncedAt: string | null;
  rejected: string[];
  /** A saved copy has loaded or the first pull has landed, so screens can draw from the store. */
  ready: boolean;
}

export interface SyncClientOptions {
  transport: Transport;
  persistence: Persistence;
  context: () => MutationContext;
  /** Delay before retry number n (0-based). Defaults to 1, 2, 4 ... 60 seconds. */
  retryMs?: (n: number) => number;
  onSignedOut?: () => void;
}

const newClientId = () => crypto.randomUUID();
const PUSH_LIMIT = 500;

export class SyncClient {
  readonly store: SyncStore;
  private clientId = "";
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private state: SyncStatus = { waiting: 0, online: true, lastSyncedAt: null, rejected: [], ready: false };
  private statusListeners = new Set<() => void>();

  constructor(private readonly opts: SyncClientOptions) {
    this.store = new SyncStore(opts.context);
  }

  async start(): Promise<void> {
    const saved = await this.opts.persistence.load().catch(() => null);
    this.clientId = saved?.clientId ?? newClientId();
    if (saved) await this.store.restore(saved);
    this.updateStatus(saved ? { ready: true } : {});
    void this.sync();
  }

  /** Applies a change now and queues it. A change the rules refuse is reported in status, and this returns false. */
  async mutate(name: string, args: unknown): Promise<boolean> {
    if (this.stopped) return false;
    try {
      await this.store.mutate(name, args);
    } catch (err) {
      if (!(err instanceof MutationRejected)) throw err;
      this.updateStatus({ rejected: [...this.state.rejected, describeRejection(name, err.message)] });
      return false;
    }
    this.updateStatus({});
    await this.persist();
    void this.sync();
    return true;
  }

  /** Pushes anything waiting, then pulls. Overlapping calls coalesce into one more round. */
  sync(): Promise<void> {
    // Before start() has loaded the client id, a pull would be refused. start() syncs once it has.
    if (this.stopped || !this.clientId) return Promise.resolve();
    this.again = true;
    // `running` is cleared in the same tick as the last `again` check. A .finally() would leave a gap where a call
    // sees a loop that has already ended and its change is never pushed.
    this.running ??= (async () => {
      try {
        while (this.again) {
          this.again = false;
          await this.round();
        }
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Resolves when no round is running. For tests and for code that wants to wait for a quiet moment. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  status(): SyncStatus {
    return this.state;
  }

  onStatus(fn: () => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private async round(): Promise<void> {
    try {
      if (this.store.pending.length) {
        const batch = this.store.pending.slice(0, PUSH_LIMIT);
        const names = new Map(batch.map((m) => [m.id, m.name]));
        const res = await this.opts.transport.push({ clientId: this.clientId, mutations: batch });
        if (res.status === 401) return this.signedOut();
        if (!res.ok) throw new Error(`push ${res.status}`);
        if (res.result.rejected.length) {
          this.updateStatus({ rejected: [...this.state.rejected, ...res.result.rejected.map((r) => describeRejection(names.get(r.id) ?? "", r.message))] });
        }
        if (this.store.pending.length > batch.length) this.again = true;
      }
      const pulled = await this.opts.transport.pull(this.store.version, this.clientId);
      if (pulled.status === 401) return this.signedOut();
      if (!pulled.ok) throw new Error(`pull ${pulled.status}`);
      await this.store.applyPull(pulled.result);
      await this.persist();
      this.failures = 0;
      this.updateStatus({ online: true, ready: true, lastSyncedAt: new Date().toISOString() });
    } catch {
      this.updateStatus({ online: false });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = (this.opts.retryMs ?? ((n) => Math.min(60_000, 1000 * 2 ** n)))(this.failures++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, delay);
  }

  private signedOut(): void {
    this.opts.onSignedOut?.();
  }

  private async persist(): Promise<void> {
    if (this.stopped) return;
    await this.opts.persistence.save({ clientId: this.clientId, ...this.store.save() }).catch(() => undefined);
  }

  private updateStatus(patch: Partial<SyncStatus>): void {
    this.state = { ...this.state, ...patch, waiting: this.store.pending.length };
    for (const fn of this.statusListeners) fn();
  }

  /** Clears the rejected-change messages once a screen has shown them. */
  dismissRejected(): void {
    this.updateStatus({ rejected: [] });
  }

  /** Stops for good: no more rounds, retries or saves. Called on unmount, or when another tab takes over. */
  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

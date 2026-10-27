import type { MutationContext } from "./mutators";
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

export class SyncClient {
  readonly store: SyncStore;
  private clientId = "";
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SyncStatus = { waiting: 0, online: true, lastSyncedAt: null, rejected: [] };
  private statusListeners = new Set<() => void>();

  constructor(private readonly opts: SyncClientOptions) {
    this.store = new SyncStore(opts.context);
  }

  async start(): Promise<void> {
    const saved = await this.opts.persistence.load().catch(() => null);
    this.clientId = saved?.clientId ?? newClientId();
    if (saved) await this.store.restore(saved);
    this.updateStatus({});
    void this.sync();
  }

  async mutate(name: string, args: unknown): Promise<void> {
    await this.store.mutate(name, args);
    this.updateStatus({});
    await this.persist();
    void this.sync();
  }

  /** Pushes anything waiting, then pulls. Overlapping calls coalesce into one more round. */
  sync(): Promise<void> {
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
        const res = await this.opts.transport.push({ clientId: this.clientId, mutations: this.store.pending });
        if (res.status === 401) return this.signedOut();
        if (!res.ok) throw new Error(`push ${res.status}`);
        if (res.result.rejected.length) this.updateStatus({ rejected: [...this.state.rejected, ...res.result.rejected.map((r) => r.message)] });
      }
      const pulled = await this.opts.transport.pull(this.store.version, this.clientId);
      if (pulled.status === 401) return this.signedOut();
      if (!pulled.ok) throw new Error(`pull ${pulled.status}`);
      await this.store.applyPull(pulled.result);
      await this.persist();
      this.failures = 0;
      this.updateStatus({ online: true, lastSyncedAt: new Date().toISOString() });
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

  /** Cancels a scheduled retry. Called when the app unmounts the client. */
  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

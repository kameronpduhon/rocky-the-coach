import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimSync, type LockLike } from "~/sync/tab-lock";

/** Enough of the Web Locks API for one exclusive lock: queueing, abort, and steal. */
class FakeLocks implements LockLike {
  private holder: ((e: unknown) => void) | null = null;
  private queue: (() => void)[] = [];

  /** `ignoreAbort` acts like Chrome missing an abort sent in the same tick as the request. */
  constructor(private readonly ignoreAbort = false) {}

  request(_name: string, opts: { steal?: boolean; signal?: AbortSignal }, cb: (lock: unknown) => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        this.holder = reject;
        cb({}).then(() => {
          if (this.holder !== reject) return resolve();
          this.holder = null;
          resolve();
          this.queue.shift()?.();
        }, reject);
      };
      if (!this.holder) grant();
      else if (opts.steal) {
        this.holder(new DOMException("stolen", "AbortError"));
        grant();
      } else {
        this.queue.push(grant);
        if (!this.ignoreAbort) {
          opts.signal?.addEventListener("abort", () => {
            this.queue = this.queue.filter((g) => g !== grant);
            reject(new DOMException("aborted", "AbortError"));
          });
        }
      }
    });
  }
}

const tab = () => ({ held: vi.fn(), elsewhere: vi.fn() });

describe("claimSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds the lock when no other tab has it", async () => {
    const a = tab();
    claimSync(new FakeLocks(), "rocky-sync-1", false, a);
    await vi.advanceTimersByTimeAsync(600);
    expect(a.held).toHaveBeenCalledOnce();
    expect(a.elsewhere).not.toHaveBeenCalled();
  });

  it("says elsewhere when another tab holds it, and takes over when that tab lets go", async () => {
    const locks = new FakeLocks();
    const a = tab();
    const b = tab();
    const releaseA = claimSync(locks, "rocky-sync-1", false, a);
    claimSync(locks, "rocky-sync-1", false, b);
    await vi.advanceTimersByTimeAsync(600);
    expect(b.elsewhere).toHaveBeenCalledOnce();
    releaseA();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.held).toHaveBeenCalledOnce();
  });

  it("takes the lock when asked, and tells the other tab", async () => {
    const locks = new FakeLocks();
    const a = tab();
    const b = tab();
    claimSync(locks, "rocky-sync-1", false, a);
    await vi.advanceTimersByTimeAsync(0);
    claimSync(locks, "rocky-sync-1", true, b);
    await vi.advanceTimersByTimeAsync(0);
    expect(b.held).toHaveBeenCalledOnce();
    expect(a.elsewhere).toHaveBeenCalledOnce();
  });

  it("waits again after being taken over, so closing the other tab hands it back", async () => {
    const locks = new FakeLocks();
    const a = tab();
    const b = tab();
    claimSync(locks, "rocky-sync-1", false, a);
    await vi.advanceTimersByTimeAsync(0);
    const releaseB = claimSync(locks, "rocky-sync-1", true, b);
    await vi.advanceTimersByTimeAsync(600);
    expect(a.elsewhere).toHaveBeenCalledOnce();
    releaseB();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.held).toHaveBeenCalledTimes(2);
  });

  it("never holds after release, even if the browser missed the abort and grants it later", async () => {
    const locks = new FakeLocks(true);
    const a = tab();
    const b = tab();
    const c = tab();
    const releaseA = claimSync(locks, "rocky-sync-1", false, a);
    claimSync(locks, "rocky-sync-1", false, b)();
    claimSync(locks, "rocky-sync-1", false, c);
    await vi.advanceTimersByTimeAsync(600);
    releaseA();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.held).not.toHaveBeenCalled();
    expect(b.elsewhere).not.toHaveBeenCalled();
    expect(c.held).toHaveBeenCalledOnce();
  });

  it("just holds where the browser has no Web Locks", () => {
    const a = tab();
    claimSync(undefined, "rocky-sync-1", false, a);
    expect(a.held).toHaveBeenCalledOnce();
  });
});

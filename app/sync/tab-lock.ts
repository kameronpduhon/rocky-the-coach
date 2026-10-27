// Only one tab may run the sync client: two would share one change counter and could each number a change 5,
// and the server would skip the second as already applied.

export interface LockLike {
  request(name: string, options: { steal?: boolean; signal?: AbortSignal }, callback: (lock: unknown) => Promise<void>): Promise<void>;
}

const ELSEWHERE_AFTER_MS = 500;

/**
 * Claims the right to sync for this tab. `held` runs when this tab has it. `elsewhere` runs when another tab has
 * held it for half a second, or takes it. Waiting continues in the background, so closing the other tab hands it
 * over. Returns a release for unmount.
 */
export function claimSync(locks: LockLike | undefined, name: string, steal: boolean, on: { held(): void; elsewhere(): void }): () => void {
  if (!locks) {
    on.held();
    return () => undefined;
  }
  let released = false;
  let letGoCurrent: () => void = () => undefined;

  const claim = (steal: boolean, announceWait: boolean) => {
    let letGo: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => (letGo = resolve));
    const abort = new AbortController();
    let granted = false;
    const waiting = announceWait ? setTimeout(() => !granted && on.elsewhere(), ELSEWHERE_AFTER_MS) : undefined;
    locks
      .request(name, steal ? { steal: true } : { signal: abort.signal }, async () => {
        // Chrome can miss an abort sent in the same tick as a request made during page load, and grant the lock later
        // to a claim that was already released. Letting go at once hands it to the live claim behind it.
        if (released) return;
        granted = true;
        clearTimeout(waiting);
        on.held();
        await holding;
      })
      .catch((err: unknown) => {
        clearTimeout(waiting);
        // Our own release aborts a wait; anything else means another tab took the lock.
        if (released) return;
        on.elsewhere();
        // A steal rejects the old holder with AbortError. Wait behind the new holder, so closing it hands the lock back.
        if (err instanceof DOMException && err.name === "AbortError") claim(false, false);
      });
    letGoCurrent = () => {
      clearTimeout(waiting);
      abort.abort();
      letGo();
    };
  };

  claim(steal, true);
  return () => {
    released = true;
    letGoCurrent();
  };
}

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { APP_NAME } from "~/brand";
import { localDate } from "~/domain/dates";
import { SyncClient } from "./client";
import { forgetOtherPeople, idbPersistence } from "./idb";
import type { MutationName } from "./mutators";
import { claimSync } from "./tab-lock";
import type { Row } from "./tables";
import { btn } from "~/ui/button";

const SyncContext = createContext<SyncClient | null>(null);

async function asReply<T>(res: Response) {
  return { ok: res.ok, status: res.status, result: (res.ok ? await res.json() : null) as T };
}

function createClient(userId: number): SyncClient {
  return new SyncClient({
    context: () => ({ now: new Date().toISOString(), today: localDate(new Date()) }),
    persistence: idbPersistence(userId),
    transport: {
      push: async (body) =>
        asReply(await fetch("/api/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })),
      pull: async (since, clientId) => asReply(await fetch(`/api/sync/pull?since=${since}&clientId=${encodeURIComponent(clientId)}`)),
    },
    onSignedOut: () => window.location.assign("/login"),
  });
}

/** Starts the person's sync client in the browser, in one tab at a time. Nothing waits on sync. */
export function SyncProvider({ userId, children }: { userId: number; children: React.ReactNode }) {
  const [client, setClient] = useState<SyncClient | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  // Each "Use … here" tap bumps this, which re-claims the lock with steal.
  const [takeovers, setTakeovers] = useState(0);
  useEffect(() => {
    let running: SyncClient | null = null;
    let stopListening: () => void = () => {};
    const shutdown = () => {
      stopListening();
      running?.stop();
      running = null;
      setClient(null);
    };
    const release = claimSync(navigator.locks, `rocky-sync-${userId}`, takeovers > 0, {
      held() {
        setElsewhere(false);
        const c = createClient(userId);
        running = c;
        void c.start();
        void navigator.storage?.persist?.().catch(() => undefined);
        void forgetOtherPeople(userId);
        const resync = () => document.visibilityState === "visible" && void c.sync();
        const timer = window.setInterval(resync, 60_000);
        document.addEventListener("visibilitychange", resync);
        window.addEventListener("online", resync);
        stopListening = () => {
          window.clearInterval(timer);
          document.removeEventListener("visibilitychange", resync);
          window.removeEventListener("online", resync);
        };
        setClient(c);
      },
      elsewhere() {
        shutdown();
        setElsewhere(true);
      },
    });
    return () => {
      release();
      shutdown();
    };
  }, [userId, takeovers]);
  // Pull on every navigation, so a v1 screen's server action (a set, a swap) shows on the next screen at once.
  const { key } = useLocation();
  useEffect(() => {
    void client?.sync();
  }, [client, key]);
  if (elsewhere) return <OpenElsewhere onUseHere={() => setTakeovers((n) => n + 1)} />;
  return <SyncContext.Provider value={client}>{children}</SyncContext.Provider>;
}

function OpenElsewhere({ onUseHere }: { onUseHere: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-4 px-5">
      <h1 className="font-display text-[48px] uppercase leading-none">Open in another tab.</h1>
      <p className="text-[17px] leading-[1.45] text-ink-2">{APP_NAME} keeps one copy in step at a time, so changes never cross. Close the other tab, or use {APP_NAME} here.</p>
      <button type="button" onClick={onUseHere} className={`${btn.primary} h-14`}>
        Use {APP_NAME} here
      </button>
    </main>
  );
}

export function useSyncClient(): SyncClient | null {
  return useContext(SyncContext);
}

const EMPTY: Row[] = [];

export function useTable(table: string): Row[] {
  const client = useSyncClient();
  return useSyncExternalStore(
    (fn) => client?.store.subscribe(fn) ?? (() => undefined),
    () => client?.store.rows(table) ?? EMPTY,
    () => EMPTY,
  );
}

export function useSyncStatus() {
  const client = useSyncClient();
  return useSyncExternalStore(
    (fn) => client?.onStatus(fn) ?? (() => undefined),
    () => client?.status() ?? null,
    () => null,
  );
}

/** Goes up whenever the store changes. Memoise derived screen data on it. */
export function useStoreVersion(): number {
  const client = useSyncClient();
  return useSyncExternalStore(
    (fn) => client?.store.subscribe(fn) ?? (() => undefined),
    () => client?.store.changeCount ?? 0,
    () => 0,
  );
}

/** Runs a named change on the phone now and queues it for the server. Resolves false if the rules refused it. */
export function useMutate(): (name: MutationName, args: unknown) => Promise<boolean> {
  const client = useSyncClient();
  return useCallback((name, args) => (client ? client.mutate(name, args) : Promise.resolve(false)), [client]);
}

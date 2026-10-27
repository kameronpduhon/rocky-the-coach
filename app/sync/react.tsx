import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { localDate } from "~/domain/dates";
import { SyncClient } from "./client";
import { idbPersistence } from "./idb";
import type { MutationName } from "./mutators";
import type { Row } from "./tables";

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

/** Starts the person's sync client in the browser. Renders children immediately; nothing waits on sync. */
export function SyncProvider({ userId, children }: { userId: number; children: React.ReactNode }) {
  const [client, setClient] = useState<SyncClient | null>(null);
  useEffect(() => {
    const c = createClient(userId);
    void c.start();
    void navigator.storage?.persist?.().catch(() => undefined);
    const resync = () => document.visibilityState === "visible" && void c.sync();
    const timer = window.setInterval(resync, 60_000);
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    setClient(c);
    return () => {
      c.stop();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
    };
  }, [userId]);
  // Pull on every navigation, so a v1 screen's server action (a set, a swap) shows on the next screen at once.
  const { key } = useLocation();
  useEffect(() => {
    void client?.sync();
  }, [client, key]);
  return <SyncContext.Provider value={client}>{children}</SyncContext.Provider>;
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

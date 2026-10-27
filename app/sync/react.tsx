import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { localDate } from "~/domain/dates";
import { SyncClient } from "./client";
import { idbPersistence } from "./idb";
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

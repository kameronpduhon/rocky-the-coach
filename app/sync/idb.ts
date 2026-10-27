import type { Persisted, Persistence } from "./client";

// One small IndexedDB database per person, holding the whole sync state under one key.
export function idbPersistence(userId: number): Persistence {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(`rocky-sync-${userId}`, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= open());
  let saving: ReturnType<typeof setTimeout> | null = null;
  let latest: Persisted | null = null;

  return {
    async load() {
      const d = await db();
      return new Promise<Persisted | null>((resolve, reject) => {
        const req = d.transaction("state").objectStore("state").get("sync");
        req.onsuccess = () => resolve((req.result as Persisted | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    // Saves at most every 250 ms. The last state always wins.
    async save(state) {
      latest = state;
      if (saving) return;
      saving = setTimeout(async () => {
        saving = null;
        const d = await db();
        d.transaction("state", "readwrite").objectStore("state").put(latest, "sync");
      }, 250);
    },
  };
}

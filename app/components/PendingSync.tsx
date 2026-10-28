import { useSyncStatus } from "~/sync/react";

/** Offline, says how many changes are waiting for a signal. Every change goes through the sync client now. */
export function PendingSync() {
  const sync = useSyncStatus();
  const waiting = sync && !sync.online ? sync.waiting : 0;
  if (waiting === 0) return null;
  return (
    <div role="status" className="glass fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[14px] font-semibold">
      Saving {waiting} change{waiting === 1 ? "" : "s"}... (offline)
    </div>
  );
}

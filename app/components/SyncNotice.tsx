import { useSyncClient, useSyncStatus } from "~/sync/react";

/** One line naming a change that did not save. It stays until dismissed. */
export function SyncNotice() {
  const client = useSyncClient();
  const first = useSyncStatus()?.rejected[0];
  if (!first) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-[max(12px,env(safe-area-inset-top))] z-40 mx-auto flex max-w-[528px] items-center gap-3 rounded-[6px] border-[1.5px] border-ink bg-paper py-1.5 pl-4 pr-1.5">
      <p className="flex-1 text-[15px] leading-snug text-ink">{first}</p>
      <button type="button" onClick={() => client?.dismissRejected()} className="h-11 flex-none px-3 font-num text-[16px] font-bold">
        OK
      </button>
    </div>
  );
}

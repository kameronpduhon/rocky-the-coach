import { useMemo, useState } from "react";
import { pageTitle } from "~/brand";
import { useNow } from "~/lib/use-now";
import { buildProgress, type Range } from "~/progress/model";
import { ProgressScreen } from "~/progress/ProgressScreen";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export function meta() {
  return [{ title: pageTitle("Progress") }];
}

/** No loader: Progress reads the phone's copy, like Today. */
export default function Progress() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [range, setRange] = useState<Range>("phase");
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const model = useMemo(
    () => (client && ready ? buildProgress((t) => client.store.rows(t), new Date(minute * 60_000), range) : null),
    [client, ready, version, minute, range],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <ProgressScreen m={model} range={range} onRange={setRange} />;
}

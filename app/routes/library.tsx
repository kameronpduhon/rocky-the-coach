import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { mealDate } from "~/domain/dates";
import { LibraryScreen, type LibraryTab } from "~/library/LibraryScreen";
import { buildLibrary } from "~/library/model";
import { useNow } from "~/lib/use-now";
import { useMe } from "~/me";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export function meta() {
  return [{ title: pageTitle("Library") }];
}

/** No loader: the Library reads the phone's copy. It works for everyone, with a plan or without. */
export default function Library() {
  const layout = useMe();
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const tab: LibraryTab = params.get("tab") === "exercises" ? "exercises" : "meals";
  const model = useMemo(
    () => (client && ready && layout ? buildLibrary((t) => client.store.rows(t), new Date(minute * 60_000), layout.hasPlan, query) : null),
    [client, ready, layout, version, minute, query],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return (
    <LibraryScreen
      m={model}
      tab={tab}
      onTab={(t) => setParams(t === "meals" ? {} : { tab: t }, { replace: true, preventScrollReset: true })}
      query={query}
      onQuery={setQuery}
      date={mealDate(new Date(minute * 60_000))}
    />
  );
}

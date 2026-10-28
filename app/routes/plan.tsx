import { useMemo } from "react";
import { pageTitle } from "~/brand";
import { useNow } from "~/lib/use-now";
import { buildPlan } from "~/plan/model";
import { PlanScreen } from "~/plan/PlanScreen";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export function meta() {
  return [{ title: pageTitle("Plan") }];
}

/** No loader: Plan reads the phone's copy, like Today. */
export default function Plan() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const model = useMemo(() => (client && ready ? buildPlan((t) => client.store.rows(t), new Date(minute * 60_000)) : null), [client, ready, version, minute]);
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <PlanScreen m={model} />;
}

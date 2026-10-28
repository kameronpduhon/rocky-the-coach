import { useMemo } from "react";
import { pageTitle } from "~/brand";
import { LiftsScreen } from "~/lifts/LiftsScreen";
import { buildLifts } from "~/lifts/model";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("All lifts") }];
}

export default function AllLifts() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const model = useMemo(() => (client && ready ? buildLifts((t) => client.store.rows(t)) : null), [client, ready, version]);
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <LiftsScreen m={model} />;
}

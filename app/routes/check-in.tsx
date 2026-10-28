import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { CheckInScreen } from "~/checkin/CheckInScreen";
import { buildCheckIn, type PageChoices } from "~/checkin/model";
import { useNow } from "~/lib/use-now";
import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Sunday check-in") }];
}

/** No loader: the check-in reads the phone's copy, so Sunday works with no signal. Finish is one named change. */
export default function CheckIn() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const mutate = useMutate();
  const [search] = useSearchParams();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  // Dev only: ?now=2026-10-25T18:00:00-05:00 pins the page's clock, so the Sunday window can be looked at any day.
  const pinned = import.meta.env.DEV ? search.get("now") : null;
  const at = pinned && !Number.isNaN(Date.parse(pinned)) ? Date.parse(pinned) : minute * 60_000;
  // The page's choices until Finish. Only the waist saves before it.
  const [choices, setChoices] = useState<PageChoices | null>(null);
  const [editing, setEditing] = useState(false);
  const model = useMemo(
    () => (client && ready ? buildCheckIn((t) => client.store.rows(t), new Date(at), choices, editing) : null),
    [client, ready, version, at, choices, editing],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;

  const finish = async () => {
    if (!model.finish) return;
    if (await mutate("finishCheckIn", { ...model.finish, at: new Date().toISOString() })) {
      setChoices(null);
      setEditing(false);
    }
  };

  return (
    <CheckInScreen
      m={model}
      onChoose={(change) => setChoices((held) => ({ ...(held?.week === model.monday ? held : model.choices), ...change }))}
      onWaist={(inches) => void mutate("logWaist", { date: model.sunday, inches })}
      onFinish={() => void finish()}
      onReopen={() => {
        setChoices(null);
        setEditing(true);
      }}
    />
  );
}

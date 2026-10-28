import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { mealDate } from "~/domain/dates";
import { GroceriesScreen } from "~/groceries/GroceriesScreen";
import { weekGroceries } from "~/groceries/model";
import { useNow } from "~/lib/use-now";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Groceries") }];
}

/** No loader: the list reads the phone's copy, so it opens in the store with no signal. */
export default function Groceries() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [params] = useSearchParams();
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const week = params.get("week");
  const kcal = params.get("kcal");
  // The check-in's link always carries kcal, so a link with kcal and no rest means nothing rests.
  const rest = params.has("rest") || kcal !== null ? params.getAll("rest").filter(Boolean).join(",") : null;
  const model = useMemo(
    () =>
      client && ready
        ? weekGroceries((t) => client.store.rows(t), mealDate(new Date(minute * 60_000)), { week, kcal, rest: rest === null ? null : rest.split(",").filter(Boolean) })
        : null,
    [client, ready, version, minute, week, kcal, rest],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <GroceriesScreen m={model} fromCheckIn={params.get("from") === "check-in"} />;
}

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { exercises } from "~/content";
import { mealDate } from "~/domain/dates";
import { useNow } from "~/lib/use-now";
import { LiftScreen } from "~/lifts/LiftScreen";
import { buildLift } from "~/lifts/model";
import { useMe } from "~/me";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { Poster } from "~/ui/Poster";
import type { Route } from "./+types/lift";

export const handle = { hideTabBar: true };

export function meta({ params }: Route.MetaArgs) {
  return [{ title: pageTitle(exercises.get(params.id)?.name ?? "Lift") }];
}

/** One lift's page. It works without a plan, so the Library's exercise rows open it for everyone. */
export default function Lift({ params }: Route.ComponentProps) {
  const layout = useMe();
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [search] = useSearchParams();
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const from = search.get("from") === "progress" ? "progress" : "library";
  const model = useMemo(
    () => (client && ready && layout ? buildLift((t) => client.store.rows(t), mealDate(new Date(minute * 60_000)), params.id, from, layout.hasPlan) : null),
    [client, ready, layout, version, minute, params.id, from],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!client || !ready || !layout) return <main aria-busy="true" className="min-h-dvh" />;
  if (!model) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-5">
        <Poster lines={["Not in", "the library."]} meta="That exercise may have been renamed or removed." />
        <Link to="/library?tab=exercises" className={`${btn.outline} h-14 text-[17px]`}>
          Back to Library
        </Link>
      </main>
    );
  }
  return <LiftScreen p={model} />;
}

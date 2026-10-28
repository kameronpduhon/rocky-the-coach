import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import type { Route } from "./+types/meal";
import { meals } from "~/content";
import { useNow } from "~/lib/use-now";
import { MealScreen } from "~/meal/MealScreen";
import { buildMeal } from "~/meal/model";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { Poster } from "~/ui/Poster";

export const handle = { hideTabBar: true };

export function meta({ params }: Route.MetaArgs) {
  return [{ title: pageTitle(meals.get(params.slug)?.name ?? "Meal") }];
}

/** No loader: the screen reads the phone's copy, so it opens with no signal, like Today. */
export default function Meal({ params }: Route.ComponentProps) {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [search] = useSearchParams();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const slot = search.get("slot");
  const model = useMemo(
    () => (client && ready ? buildMeal((t) => client.store.rows(t), new Date(minute * 60_000), { slug: params.slug, slot }) : null),
    [client, ready, version, minute, params.slug, slot],
  );
  const fromLibrary = search.get("from") === "library";
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!client || !ready) return <main aria-busy="true" className="min-h-dvh" />;
  if (!model) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-5">
        <Poster lines={["Not in", "the library."]} meta="That meal may have been renamed or removed." />
        <Link to={fromLibrary ? "/library" : "/"} className={`${btn.outline} h-14 text-[17px]`}>
          {fromLibrary ? "Back to Library" : "Back to Today"}
        </Link>
      </main>
    );
  }
  return <MealScreen m={model} fromLibrary={fromLibrary} />;
}

import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { plan } from "~/content";
import { useNow } from "~/lib/use-now";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { dateLabel } from "~/today/model";
import { DoneScreen } from "~/workout/DoneScreen";
import { buildWorkout } from "~/workout/model";
import { PlanScreen } from "~/workout/PlanScreen";
import { SetScreen } from "~/workout/SetScreen";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Workout · Rocky" }];
}

const BACK: Record<string, string> = { today: "/", plan: "/plan", progress: "/progress" };

/** All four workout screens. The workout's state picks one, so a change on the phone moves the screen on by itself. */
export default function Workout() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [params] = useSearchParams();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const date = params.get("date");
  // ?plan=b is the Plan B reminder's link.
  const template = params.get("plan") === "b" ? plan.planB : params.get("template");
  const model = useMemo(
    () => (client && ready ? buildWorkout((t) => client.store.rows(t), new Date(minute * 60_000), { date, template }) : null),
    [client, ready, version, minute, date, template],
  );
  const back = BACK[params.get("from") ?? ""] ?? "/";
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  if (model.screen === "plan") return <PlanScreen m={model} back={back} dateLabel={dateLabel(model.date)} />;
  if (model.screen === "set") return <SetScreen m={model} back={back} />;
  return <DoneScreen m={model} back={back} dateLabel={dateLabel(model.date)} />;
}

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Sheet } from "./Sheet";

const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** Corrects or removes one day's weigh-in. Saves through the Progress route, which owns weigh-in history. */
export function WeighInSheet({ entry, onClose }: { entry: { date: string; weight: number } | null; onClose: () => void }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [weight, setWeight] = useState("");
  useEffect(() => setWeight(entry ? String(entry.weight) : ""), [entry?.date, entry?.weight]);
  // Closes when a submit settles with ok. The last result lingers on the fetcher, so reopening must not re-close.
  const busy = useRef(false);
  useEffect(() => {
    if (fetcher.state !== "idle") busy.current = true;
    else if (busy.current) {
      busy.current = false;
      if (fetcher.data?.ok) onClose();
    }
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <Sheet open={entry !== null} onClose={onClose} title="Edit weigh-in">
      {entry && (
        <fetcher.Form method="post" action="/progress" className="flex flex-col gap-3">
          <input type="hidden" name="date" value={entry.date} />
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
            {DAY_FMT.format(new Date(`${entry.date}T12:00:00Z`))}
            <div className="flex h-[52px] items-center gap-1.5 rounded-xl bg-fill px-3">
              <input
                name="weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal"
                required
                autoFocus
                className="tabular w-full min-w-0 bg-transparent text-[20px] font-semibold text-label outline-none"
              />
              <span className="text-[17px] font-semibold text-label-2">lb</span>
            </div>
          </label>
          {fetcher.data?.error && <p className="text-[14px] font-semibold text-calories">{fetcher.data.error}</p>}
          <div className="mt-1 flex gap-2.5">
            <button type="submit" name="intent" value="delete-weigh-in" formNoValidate className="btn-secondary h-[52px] rounded-full px-5 text-[16px] font-semibold text-calories">
              Delete
            </button>
            <button type="submit" name="intent" value="weigh-in" disabled={fetcher.state !== "idle"} className="btn-prominent h-[52px] flex-1 rounded-full text-[17px] font-semibold disabled:opacity-60">
              {fetcher.state !== "idle" ? "Saving..." : "Save"}
            </button>
          </div>
        </fetcher.Form>
      )}
    </Sheet>
  );
}

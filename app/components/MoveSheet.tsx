import { useState } from "react";
import { useRevalidator } from "react-router";
import type { ScheduleDay } from "~/content/schedule";
import { useMutate, useSyncClient } from "~/sync/react";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";

const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (date: string) => DAY_FMT.format(new Date(`${date}T12:00:00Z`));

/**
 * Moves a workout between two days of the week. From a workout day it lists every other day to move it to; from a
 * rest day it lists the workouts to bring there. Either way the two days trade, so the day left behind rests. The
 * move is a named change on the phone, so it works offline; a refusal shows in the sync notice.
 */
export function MoveSheet({ open, onClose, anchor, week, today }: { open: boolean; onClose: () => void; anchor: ScheduleDay; week: ScheduleDay[]; today?: string }) {
  const mutate = useMutate();
  const client = useSyncClient();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const pushing = anchor.templateId !== null;
  const options = week.filter((d) => d.date !== anchor.date && (pushing || d.templateId !== null));
  const title = pushing ? `Move ${anchor.name}` : anchor.date === today ? "Train today" : `Train on ${dayLabel(anchor.date).split(",")[0]}`;

  async function move(to: string) {
    setBusy(true);
    const ok = await mutate("moveWorkout", { a: anchor.date, b: to });
    setBusy(false);
    if (!ok) return;
    onClose();
    // The v1 Plan screen reads the server, so it reloads once the move has been sent.
    await client?.sync();
    revalidator.revalidate();
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-3 px-1 text-[14px] leading-snug text-label-2">
        {pushing ? "Pick the day you'll train instead. That day's plan comes here." : "Pick a workout to do this day. Its old day turns into a rest day."}
      </p>
      {options.length === 0 ? (
        <p className="px-1 text-[15px] text-label-2">No workouts left to move this week.</p>
      ) : (
        <div className="overflow-hidden rounded-[6px] bg-card">
          {options.map((d) => (
            <button
              key={d.date}
              type="button"
              disabled={d.logged || busy}
              onClick={() => void move(d.date)}
              className="flex min-h-[60px] w-full items-center gap-3 border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold">
                  {dayLabel(d.date)}
                  {d.date === today && <span className="text-label-2"> · today</span>}
                </div>
                <div className="mt-px text-[14px] text-label-2">
                  {d.logged ? `${d.name ?? "Workout"} · already logged` : pushing ? (d.name ? `${d.name} · trades places` : "Rest day") : d.name}
                </div>
              </div>
              <span className="flex-none text-label-4">
                <Icon name="chevron" size={18} strokeWidth={2.4} />
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

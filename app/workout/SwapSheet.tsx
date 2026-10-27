import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { exerciseImage } from "~/content";
import { btn } from "~/ui/button";
import { ChoiceRow } from "~/ui/ChoiceRow";
import { swapOptions, type Lift } from "./lifts";
import type { LiftView } from "./model";

type Mode = "today" | "always" | "skip";

/** Swap a lift for today, swap it for good, or skip it today (spec section 2, Plan). */
export function SwapSheet({
  lift,
  list,
  canAlways,
  onToday,
  onAlways,
  onSkip,
  onClose,
}: {
  lift: LiftView | null;
  list: Lift[];
  canAlways: boolean;
  onToday: (exercise: string) => void;
  onAlways: (exercise: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("today");
  if (!lift) return null;
  const name = lift.name.toLowerCase();
  const modes: { value: Mode; label: string }[] = [{ value: "today", label: "Today" }, ...(canAlways ? [{ value: "always" as const, label: "Always" }] : []), { value: "skip", label: "Skip today" }];
  return (
    <Sheet open onClose={onClose} title={`Swap ${lift.name}`}>
      {lift.sets.length > 0 || lift.checked ? (
        <p className="text-[16px] leading-[1.45] text-ink-2">Sets are logged on {name}, so it stays. Add a lift from the list instead.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ChoiceRow label="Swap for" layout="grid" choices={modes} value={mode} onPick={setMode} />
          {mode === "skip" ? (
            <button type="button" onClick={onSkip} className={`${btn.outline} h-14 text-[17px]`}>
              Skip {name} today
            </button>
          ) : (
            <>
              <p className="text-[15px] leading-[1.4] text-ink-3">{mode === "always" ? `Replaces ${name} in this workout from now on.` : `Only today changes. ${lift.name} comes back next time.`}</p>
              <ul className="flex flex-col">
                {swapOptions(list, lift.position).map((e) => (
                  <li key={e.id} className="border-t border-rule">
                    <button type="button" onClick={() => (mode === "always" ? onAlways(e.id) : onToday(e.id))} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
                      <img src={exerciseImage(e, 0)} alt="" className="size-12 flex-none rounded-[6px] bg-well object-cover" />
                      <span className="flex-1 text-[17px] font-bold">{e.name}</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

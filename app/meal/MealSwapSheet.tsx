import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { JoinedChoice } from "~/ui/JoinedChoice";
import type { MealModel } from "./model";

/** Swap today's slot for another meal that fits it, best fit first (mock MealSwap). */
export function MealSwapSheet({ m, onClose, onSwapped }: { m: MealModel; onClose: () => void; onSwapped: (slug: string) => void }) {
  const mutate = useMutate();
  const [how, setHow] = useState<"today" | "always">("today");
  async function pick(slug: string) {
    const ok = await mutate("swapMeal", { date: m.date, slot: m.slot, mealSlug: slug, always: how === "always" });
    onClose();
    if (ok) onSwapped(slug);
  }
  return (
    <Sheet open onClose={onClose} title={`Swap ${m.slot}`} dismiss="cancel">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <JoinedChoice
            label="How long"
            choices={[
              { value: "today", label: "Just today" },
              { value: "always", label: "Always" },
            ]}
            value={how}
            onPick={setHow}
            height="h-[46px]"
          />
          <p className="text-[14px] text-ink-3">Only today changes. Always rests the {m.meal.name.toLowerCase()} for 4 weeks.</p>
        </div>
        <p className="text-[15px] text-ink-3">Best fit for what's left today first.</p>
        <ul className="flex flex-col">
          {m.swaps.map((o) => (
            <li key={o.slug} className={o.best ? "border-t-2 border-ink" : "border-t border-rule last:border-b"}>
              <button type="button" onClick={() => void pick(o.slug)} className="flex min-h-16 w-full items-center gap-3 text-left">
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className={`text-[17px] ${o.best ? "font-bold" : "font-semibold"}`}>{o.name}</span>
                  <span className="text-[14px] tabular-nums text-ink-3">
                    {o.kcal} cal · {o.protein} g
                    {o.best && (
                      <>
                        {" · "}
                        <strong className="font-bold text-ink">best fit</strong>
                      </>
                    )}
                    {o.lowProtein && " · lower protein, add a shake"}
                  </span>
                </span>
                <Icon name="chevron" size={16} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

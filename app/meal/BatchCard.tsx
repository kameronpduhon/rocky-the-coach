import { useState } from "react";
import { COACH_NAME } from "~/brand";
import { useMutate } from "~/sync/react";
import type { MealModel } from "./model";

const andList = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

/** "After cooking": weigh the whole batch's protein once, and the next days show their portion (mock MealBatch). */
export function BatchCard({ m, portions }: { m: MealModel; portions: number }) {
  const mutate = useMutate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const protein = m.mainProtein.name.toLowerCase();
  return (
    <section aria-labelledby="after" className="flex flex-col gap-3 rounded-[6px] border-2 border-ink bg-raised p-4">
      <h2 id="after" className="font-display text-[26px] uppercase">
        After cooking
      </h2>
      {m.todayBatch ? (
        <>
          <div className="flex items-baseline justify-between border-t border-rule pt-2.5">
            <span className="text-[16px]">Each portion</span>
            <span className="tabular font-num text-[26px] font-bold">{m.todayBatch.portionG} g cooked</span>
          </div>
          {m.todayBatch.laterDays.length > 0 && (
            <p className="text-[15px] leading-[1.4] text-ink-3">
              {andList(m.todayBatch.laterDays)} {m.slot} will say: put {m.todayBatch.portionG} g of cooked {protein} on the scale.
            </p>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const cooked = Math.round(Number(value));
            if (!Number.isFinite(cooked) || cooked < 1 || cooked > 10_000) return setError("Enter the cooked weight in grams.");
            setError(null);
            void mutate("startBatch", { clientId: crypto.randomUUID(), date: m.date, slot: m.slot, mealSlug: m.meal.slug, portions, cookedWeightG: cooked });
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="cooked" className="text-[16px] leading-[1.4]">
            Weigh all the cooked {protein}. {COACH_NAME} splits it into {portions} portions.
          </label>
          <div className="flex items-center gap-2.5">
            <div className="flex h-14 flex-1 items-center gap-1.5 rounded-[6px] border-[1.5px] border-ink bg-field px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red">
              <input id="cooked" value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="0" className="tabular w-full min-w-0 bg-transparent font-num text-[30px] font-bold outline-none" />
              <span className="font-num text-[18px] font-bold text-ink-3">g cooked</span>
            </div>
            <button type="submit" className="h-14 rounded-[6px] bg-ink px-[18px] font-num text-[17px] font-bold text-paper">
              Save
            </button>
          </div>
          {error && <p className="text-[14px] text-ink-2">{error}</p>}
        </form>
      )}
    </section>
  );
}

import { useState } from "react";
import { searchFoods } from "~/ai/food-table";
import { Sheet } from "~/components/Sheet";
import type { FoodGroup, FoodTableEntry } from "~/content/schema";
import { btn } from "~/ui/button";
import { FIELD } from "./SomethingNewForm";

/** "Pick a food": the whole table by group, filtered as you type. A chip opens it on its group. */
export function FoodPicker({ start, onPick, onClose }: { start: FoodGroup | null; onPick: (food: FoodTableEntry) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<FoodGroup | null>(start);
  const sections = searchFoods(query, group);
  return (
    <Sheet open onClose={onClose} title="Pick a food">
      <div className="flex flex-col gap-4">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods" aria-label="Search foods" className={FIELD} />
        {group && (
          <button type="button" onClick={() => setGroup(null)} className={btn.quiet}>
            All foods
          </button>
        )}
        {sections.length === 0 && <p className="text-[15px] text-ink-3">No food in the table matches that.</p>}
        {sections.map((s) => (
          <section key={s.group} aria-labelledby={`picker-${s.group}`} className="flex flex-col">
            <h3 id={`picker-${s.group}`} className="pb-1 font-num text-[14px] font-bold uppercase tracking-[0.04em] text-ink-3">
              {s.label}
            </h3>
            <ul className="flex flex-col">
              {s.foods.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => onPick(f)} className="flex min-h-14 w-full flex-col justify-center border-t border-rule py-1.5 text-left">
                    <span className="text-[16px]">{f.name}</span>
                    <span className="tabular text-[14px] text-ink-3">
                      {Math.round(f.kcalPer100)} cal · {Math.round(f.proteinPer100)} g per 100 g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

import { useState } from "react";
import { Toggle } from "~/components/Toggle";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import type { FormValues } from "./offplan";

export const FIELD = "h-12 rounded-[6px] border-[1.5px] border-border bg-field px-3 text-[17px] font-normal text-ink";
export const LABEL = "flex flex-col gap-1 text-[13px] font-semibold text-ink-3";

/** Project 3's Something new form. `initial` fills it from a scan or a plate; `note` says why it opened. */
export function SomethingNewForm({ date, initial, note, onDone }: { date: string; initial?: FormValues; note?: string; onDone: () => void }) {
  const mutate = useMutate();
  const [relaxed, setRelaxed] = useState(false);
  const [saveUsual, setSaveUsual] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name") ?? "").trim();
        const kcal = Number(f.get("kcal"));
        if (!name || !Number.isFinite(kcal)) return;
        void mutate("logOffPlan", {
          clientId: crypto.randomUUID(),
          date,
          name,
          category: String(f.get("category")),
          kcal: Math.round(kcal),
          proteinG: Math.round(Number(f.get("protein") || 0)),
          relaxed,
          usualId: saveUsual ? crypto.randomUUID() : undefined,
        });
        onDone();
      }}
      className="flex flex-col gap-3"
    >
      {note && <p className="text-[15px] leading-[1.4] text-ink-2">{note}</p>}
      <label className={LABEL}>
        What was it
        <input name="name" required maxLength={80} defaultValue={initial?.name} placeholder="What was it" className={FIELD} />
      </label>
      <label className={LABEL}>
        Category
        <select name="category" defaultValue={initial?.category ?? "meal"} className={FIELD}>
          <option value="meal">Meal</option>
          <option value="snack">Snack</option>
          <option value="dessert">Dessert</option>
          <option value="drink">Drink</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Calories
          <input name="kcal" inputMode="numeric" required defaultValue={initial?.kcal} className={`tabular ${FIELD}`} />
        </label>
        <label className={LABEL}>
          Protein (g)
          <input name="protein" inputMode="numeric" defaultValue={initial?.protein ?? 0} className={`tabular ${FIELD}`} />
        </label>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
        <span>Relaxed meal (weekend restaurant)</span>
        <Toggle on={relaxed} label="Relaxed meal" onChange={setRelaxed} />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
        <span>Save as a usual</span>
        <Toggle on={saveUsual} label="Save as a usual" onChange={setSaveUsual} />
      </div>
      <button type="submit" className={`${btn.primary} mt-1 h-14`}>
        Log it
      </button>
    </form>
  );
}

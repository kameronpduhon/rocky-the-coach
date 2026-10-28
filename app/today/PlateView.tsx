import { useState } from "react";
import { FOOD_BY_ID } from "~/ai/food-table";
import { addFood, addOil, pickFood, plateTotal, rowNumbers, setGrams, stepDown, stepUp, typeNumbers, uncountedNote, type PlateRow } from "~/ai/plate";
import { Toggle } from "~/components/Toggle";
import { Icon } from "~/components/ui";
import type { FoodGroup } from "~/content/schema";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { FoodPicker } from "./FoodPicker";
import type { FormValues } from "./offplan";
import { FIELD, LABEL } from "./SomethingNewForm";

const LOG_MAX_KCAL = 5000;
const CHIP = "h-11 rounded-[6px] border-[1.5px] border-border px-3.5 font-num text-[16px] font-bold text-ink";

/** The sheet's heading on the plate: the name, which turns into a field when tapped. */
export function PlateTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Name"
        maxLength={60}
        defaultValue={title}
        onBlur={(e) => {
          const t = e.currentTarget.value.trim();
          if (t) onRename(t);
          setEditing(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${FIELD} min-w-0 flex-1`}
      />
    );
  }
  return (
    <h2 className="min-w-0">
      <button type="button" onClick={() => setEditing(true)} aria-label={`${title}. Rename`} className="block max-w-full truncate text-left font-display text-[28px] uppercase">
        {title}
      </button>
    </h2>
  );
}

function GramStepper({ label, grams, onChange }: { label: string; grams: number; onChange: (grams: number) => void }) {
  return (
    <div className="flex flex-none items-center">
      <button type="button" aria-label={`Less ${label}`} disabled={grams === 0} onClick={() => onChange(stepDown(grams))} className={`${btn.outline} size-11 disabled:border-border disabled:text-muted`}>
        <Icon name="minus" size={16} strokeWidth={2.6} />
      </button>
      <span className="tabular w-16 whitespace-nowrap text-center font-num text-[17px] font-bold">{grams} g</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(stepUp(grams))} className={`${btn.outline} size-11`}>
        <Icon name="plus" size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}

const parse = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) || Number(s) < 0 ? null : Number(s));

/** Option 2A: one row per food, the table's numbers, a total that adds up, and Log it. */
export function PlateView({
  date,
  said,
  title,
  startRows,
  startCategory,
  onEdit,
  onDone,
}: {
  date: string;
  said: string;
  title: string;
  startRows: PlateRow[];
  startCategory: FormValues["category"];
  onEdit: () => void;
  onDone: () => void;
}) {
  const mutate = useMutate();
  const [rows, setRows] = useState(startRows);
  const [typed, setTyped] = useState<Record<string, { kcal: string; protein: string }>>({});
  const [category, setCategory] = useState(startCategory);
  const [relaxed, setRelaxed] = useState(false);
  const [saveUsual, setSaveUsual] = useState(false);
  const [picker, setPicker] = useState<{ group: FoodGroup | null; replace?: string } | null>(null);

  const total = plateTotal(rows, FOOD_BY_ID);
  const note = uncountedNote(rows, FOOD_BY_ID);
  const tooBig = total.kcal > LOG_MAX_KCAL;

  const type = (key: string, field: "kcal" | "protein", value: string) => {
    const next = { ...(typed[key] ?? { kcal: "", protein: "" }), [field]: value };
    setTyped({ ...typed, [key]: next });
    setRows((rs) => typeNumbers(rs, key, { kcal: parse(next.kcal), protein: parse(next.protein) }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-[6px] bg-well px-3.5 py-3 text-[15px] leading-[1.4] text-ink-2">
        <span className="flex-1">{said}</span>
        <button type="button" onClick={onEdit} className="font-semibold text-ink-3 underline decoration-underline underline-offset-[3px]">
          Edit
        </button>
      </div>

      <ul className="flex flex-col">
        {rows.map((r) => {
          const food = r.foodId === null ? undefined : FOOD_BY_ID.get(r.foodId);
          const n = rowNumbers(r, FOOD_BY_ID);
          const stepper = <GramStepper label={food?.name ?? r.label} grams={r.grams} onChange={(g) => setRows((rs) => setGrams(rs, r.key, g))} />;
          if (food) {
            return (
              <li key={r.key} className="flex min-h-[60px] items-center gap-2.5 border-t border-rule py-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-semibold">{food.name}</span>
                  <span className="tabular text-[14px] text-ink-3">
                    {n!.kcal} cal · {n!.protein} g
                  </span>
                </span>
                {stepper}
              </li>
            );
          }
          return (
            <li key={r.key} className="-mx-2.5 flex flex-wrap items-center gap-2.5 border-t-2 border-ink bg-raised p-2.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-semibold">{r.label}</span>
                <span className="text-[14px] text-ink-3">Not in the food table. Type the numbers or pick a food.</span>
              </span>
              {stepper}
              <div className="flex w-full items-center gap-2">
                <input aria-label={`Calories in ${r.label}`} inputMode="numeric" placeholder="Cal" value={typed[r.key]?.kcal ?? ""} onChange={(e) => type(r.key, "kcal", e.target.value)} className={`tabular ${FIELD} h-11 min-w-0 flex-1`} />
                <input aria-label={`Protein in ${r.label}`} inputMode="numeric" placeholder="Protein g" value={typed[r.key]?.protein ?? ""} onChange={(e) => type(r.key, "protein", e.target.value)} className={`tabular ${FIELD} h-11 min-w-0 flex-1`} />
                <button type="button" onClick={() => setPicker({ group: null, replace: r.key })} className={`${btn.quiet} self-center`}>
                  Pick a food
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-[15px] text-ink-3">Anything the description left out?</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRows((rs) => addOil(rs, FOOD_BY_ID))} className={CHIP}>
            + oil
          </button>
          <button type="button" onClick={() => setPicker({ group: "sauce" })} className={CHIP}>
            + sauce
          </button>
          <button type="button" onClick={() => setPicker({ group: "drink" })} className={CHIP}>
            + drink
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t-2 border-ink pt-2.5" aria-live="polite">
        <p>
          <span className="tabular font-num text-[34px] font-bold leading-none">{total.kcal.toLocaleString("en-US")} cal</span>
          <span className="tabular font-num text-[18px] font-semibold text-ink-3"> · {total.protein} g protein</span>
        </p>
        {note && <p className="text-[14px] text-ink-2">{note}</p>}
        {tooBig && <p className="text-[14px] text-ink-2">That's past 5,000 cal. Check the grams.</p>}
      </div>

      <label className={LABEL}>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value as FormValues["category"])} className={FIELD}>
          <option value="meal">Meal</option>
          <option value="snack">Snack</option>
          <option value="dessert">Dessert</option>
          <option value="drink">Drink</option>
        </select>
      </label>
      <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
        <span>Relaxed meal (weekend restaurant)</span>
        <Toggle on={relaxed} label="Relaxed meal" onChange={setRelaxed} />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
        <span>Save as a usual</span>
        <Toggle on={saveUsual} label="Save as a usual" onChange={setSaveUsual} />
      </div>
      <button
        type="button"
        disabled={total.kcal === 0 || tooBig}
        onClick={() => {
          void mutate("logOffPlan", { clientId: crypto.randomUUID(), date, name: title, category, kcal: total.kcal, proteinG: total.protein, relaxed, usualId: saveUsual ? crypto.randomUUID() : undefined });
          onDone();
        }}
        className={`${btn.primary} h-14 disabled:opacity-50`}
      >
        Log it
      </button>

      {picker && (
        <FoodPicker
          start={picker.group}
          onClose={() => setPicker(null)}
          onPick={(food) => {
            setRows((rs) => (picker.replace ? pickFood(rs, picker.replace, food) : addFood(rs, food)));
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

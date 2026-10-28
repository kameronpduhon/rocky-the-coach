import { useRef, useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Toggle } from "~/components/Toggle";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { USUALS_SHOWN, type UsualModel } from "./usuals";

const FIELD = "h-12 rounded-[6px] border-[1.5px] border-border bg-field px-3 text-[17px] font-normal text-ink";
const LABEL = "flex flex-col gap-1 text-[13px] font-semibold text-ink-3";
const LONG_PRESS_MS = 500;

/** "Ate something else": usual orders first, one tap each, then the form for something new (option 3A). */
export function OffPlanSheet({ date, usuals, onClose }: { date: string; usuals: UsualModel[]; onClose: () => void }) {
  const mutate = useMutate();
  const [all, setAll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  const [saveUsual, setSaveUsual] = useState(false);
  const timer = useRef<number | null>(null);
  // The press that turned Log into Remove must not also tap Remove when the finger lifts.
  const longPressed = useRef(false);
  const shown = all ? usuals : usuals.slice(0, USUALS_SHOWN);

  const release = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  // A long press on a usual swaps its Log for Remove, inside the sheet. No browser dialog.
  const press = (key: string) => () => {
    release();
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setRemoving(key);
    }, LONG_PRESS_MS);
  };
  const tap = (run: () => void) => () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    run();
  };

  return (
    <Sheet open onClose={onClose} title="Ate something else">
      <div className="flex flex-col gap-4">
        {usuals.length > 0 && (
          <div className="flex flex-col">
            <ul className="flex flex-col">
              {shown.map((u) => (
                <li
                  key={u.key}
                  onPointerDown={press(u.key)}
                  onPointerUp={release}
                  onPointerLeave={release}
                  onPointerCancel={release}
                  onContextMenu={(e) => e.preventDefault()}
                  className="flex min-h-[60px] select-none items-center gap-3 border-t border-rule [-webkit-touch-callout:none] last:border-b"
                >
                  <span className="flex flex-1 flex-col">
                    <span className="text-[16px]">{u.name}</span>
                    <span className="text-[14px] tabular-nums text-muted">{u.sub}</span>
                  </span>
                  {removing === u.key ? (
                    <button
                      type="button"
                      onClick={tap(() => {
                        void mutate("removeUsual", { key: u.key });
                        setRemoving(null);
                      })}
                      className={`${btn.outline} h-11 px-3.5 text-[16px]`}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={tap(() => {
                        void mutate("logUsual", { clientId: crypto.randomUUID(), usual: u.key, date });
                        onClose();
                      })}
                      className={`${btn.outline} h-11 px-3.5 text-[16px]`}
                    >
                      Log
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!all && usuals.length > USUALS_SHOWN && (
              <button type="button" onClick={() => setAll(true)} className={btn.quiet}>
                All {usuals.length} usuals
              </button>
            )}
          </div>
        )}
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
            onClose();
          }}
          className="flex flex-col gap-3"
        >
          <label className={LABEL}>
            Something new
            <input name="name" required maxLength={80} placeholder="What was it" className={FIELD} />
          </label>
          <label className={LABEL}>
            Category
            <select name="category" defaultValue="meal" className={FIELD}>
              <option value="meal">Meal</option>
              <option value="snack">Snack</option>
              <option value="dessert">Dessert</option>
              <option value="drink">Drink</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={LABEL}>
              Calories
              <input name="kcal" inputMode="numeric" required className={`tabular ${FIELD}`} />
            </label>
            <label className={LABEL}>
              Protein (g)
              <input name="protein" inputMode="numeric" defaultValue="0" className={`tabular ${FIELD}`} />
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
      </div>
    </Sheet>
  );
}

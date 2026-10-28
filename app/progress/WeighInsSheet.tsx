import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import type { ISODate } from "~/domain/types";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (d: ISODate) => DAY.format(new Date(`${d}T12:00:00Z`));

type WeighIn = { date: ISODate; weight: number };

/** "Fix a weigh-in": the last 10, newest first. A tap opens one to change or delete, as named changes. */
export function WeighInsSheet({ weighIns, onClose }: { weighIns: WeighIn[]; onClose: () => void }) {
  const mutate = useMutate();
  const [editing, setEditing] = useState<WeighIn | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(w: WeighIn) {
    setEditing(w);
    setValue(w.weight.toFixed(1));
    setError(null);
  }

  async function save(date: ISODate) {
    const weightLb = Number(value);
    if (!Number.isFinite(weightLb) || weightLb < 80 || weightLb > 500) return setError("Enter your weight in pounds.");
    if (await mutate("editWeighIn", { date, weightLb })) setEditing(null);
  }

  async function remove(date: ISODate) {
    if (await mutate("deleteWeighIn", { date })) setEditing(null);
  }

  return (
    <Sheet open onClose={onClose} title={editing ? dayLabel(editing.date) : "Fix a weigh-in"}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(editing.date);
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-ink-3">Weight</span>
            <span className="flex h-14 items-center gap-2 rounded-[6px] border-[1.5px] border-border bg-field px-3.5">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                autoFocus
                className="tabular min-w-0 flex-1 bg-transparent font-num text-[22px] font-bold outline-none"
              />
              <span className="font-num text-[18px] font-semibold text-ink-3">lb</span>
            </span>
          </label>
          {error && <p className="text-[15px] font-semibold">{error}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={() => void remove(editing.date)} className={`${btn.outline} h-14 px-5 text-[16px]`}>
              Delete
            </button>
            <button type="submit" className={`${btn.primary} h-14 flex-1`}>
              Save
            </button>
          </div>
          <button type="button" onClick={() => setEditing(null)} className={btn.quiet}>
            Back to the list
          </button>
        </form>
      ) : (
        <ul className="flex flex-col border-t border-rule">
          {weighIns.map((w) => (
            <li key={w.date}>
              <button type="button" onClick={() => open(w)} className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-rule text-left">
                <span className="text-[16px]">{dayLabel(w.date)}</span>
                <span className="tabular flex items-center gap-1.5 font-num text-[18px] font-bold">
                  {w.weight.toFixed(1)} lb
                  <span className="text-ink-3">
                    <Icon name="chevron" size={16} strokeWidth={2.4} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

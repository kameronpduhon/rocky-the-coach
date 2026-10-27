import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { btn } from "~/ui/button";
import { Stepper } from "~/ui/Stepper";
import { nextTarget, type LiftView } from "./model";

interface Editing {
  /** The set's store key, or null for a new set. */
  key: string | null;
  setNumber: number;
  weight: number | null;
  reps: number | null;
}

/** A lift's logged sets: tap one to fix or delete it. With canAdd it also adds the next set, for a day logged after the fact. */
export function SetsSheet({
  lift,
  setsPerLift,
  canAdd,
  onEdit,
  onDelete,
  onAdd,
  onClose,
}: {
  lift: LiftView | null;
  setsPerLift: number;
  canAdd: boolean;
  onEdit: (key: string, weight: number, reps: number) => void;
  onDelete: (key: string) => void;
  onAdd: (setNumber: number, weight: number, reps: number) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  if (!lift) return null;
  const target = nextTarget(lift, setsPerLift);

  function save(e: Editing) {
    if (e.weight === null || e.reps === null) return;
    if (e.key) onEdit(e.key, e.weight, e.reps);
    else onAdd(e.setNumber, e.weight, e.reps);
    setEditing(null);
  }

  return (
    <Sheet open onClose={onClose} title={lift.name}>
      {editing ? (
        <div className="flex flex-col gap-3">
          <p className="font-num text-[16px] font-bold">SET {editing.setNumber}</p>
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Weight, lb" value={editing.weight} step={lift.increment} decimal less={`${lift.increment} pounds less`} more={`${lift.increment} pounds more`} onChange={(weight) => setEditing({ ...editing, weight })} />
            <Stepper label="Reps" value={editing.reps} step={1} less="One rep fewer" more="One rep more" onChange={(reps) => setEditing({ ...editing, reps })} />
          </div>
          <button type="button" disabled={editing.weight === null || editing.reps === null} onClick={() => save(editing)} className={`${btn.primary} h-14 disabled:opacity-60`}>
            Save set {editing.setNumber}
          </button>
          <div className="flex gap-5">
            {editing.key && (
              <button
                type="button"
                onClick={() => {
                  onDelete(editing.key!);
                  setEditing(null);
                }}
                className={btn.quiet}
              >
                Delete set {editing.setNumber}
              </button>
            )}
            <button type="button" onClick={() => setEditing(null)} className={btn.quiet}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {lift.sets.length === 0 && <p className="text-[16px] text-ink-3">No sets logged.</p>}
          <ol className="flex flex-col">
            {lift.sets.map((x) => (
              <li key={x.key} className="border-t border-rule">
                <button
                  type="button"
                  aria-label={`Set ${x.setNumber}, ${x.weight} pounds, ${x.reps} reps. Fix it`}
                  onClick={() => setEditing({ key: x.key, setNumber: x.setNumber, weight: x.weight, reps: x.reps })}
                  className="flex min-h-14 w-full items-center gap-3 text-left"
                >
                  <span className="w-14 font-num text-[15px] font-bold text-ink-3">SET {x.setNumber}</span>
                  <span className="tabular flex-1 font-num text-[26px] font-bold">
                    {x.weight} × {x.reps}
                  </span>
                  <span className="text-[14px] font-semibold text-ink-3">Fix</span>
                </button>
              </li>
            ))}
          </ol>
          {canAdd && target && (
            <button type="button" onClick={() => setEditing({ key: null, setNumber: target.setNumber, weight: target.weight, reps: target.reps })} className={`${btn.outlinePlain} mt-4 h-11 self-start px-4`}>
              + Add set {target.setNumber}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

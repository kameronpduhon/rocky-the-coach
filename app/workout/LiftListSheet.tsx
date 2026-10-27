import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { btn } from "~/ui/button";
import { setsText, type LiftView, type WorkoutModel } from "./model";

/** The lift list behind the header clock: jump to any lift, add one, undo a no-numbers check, or finish. */
export function LiftListSheet({
  m,
  open,
  onJump,
  onUncheck,
  onAdd,
  onFinish,
  onClose,
}: {
  m: WorkoutModel;
  open: boolean;
  onJump: (position: number) => void;
  onUncheck: (lift: LiftView) => void;
  onAdd: () => void;
  onFinish: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Lifts">
      <ol className="flex flex-col">
        {m.lifts.map((l, i) => (
          <li key={l.position} className="flex items-center gap-2 border-t border-rule">
            <button type="button" onClick={() => onJump(l.position)} className="flex min-h-[60px] flex-1 items-center gap-3 text-left">
              <span className="tabular w-6 font-num text-[15px] font-bold text-ink-3">{i + 1}</span>
              <span className="flex flex-1 flex-col">
                <span className="text-[17px] font-bold">{l.name}</span>
                <span className="tabular text-[14px] text-ink-3">{l.checked ? "Done, no numbers" : l.sets.length ? setsText(l.sets) : `${m.setsPerLift} × ${l.repMin} to ${l.repMax}`}</span>
              </span>
              {l.done && <Icon name="check" size={18} strokeWidth={2.8} />}
            </button>
            {l.checked && (
              <button type="button" onClick={() => onUncheck(l)} className="h-11 px-2 font-num text-[15px] font-bold underline underline-offset-[3px]">
                Undo
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-3">
        <button type="button" onClick={onAdd} className={`${btn.outlinePlain} h-11 self-start px-4`}>
          + Add a lift
        </button>
        <button type="button" onClick={onFinish} className={`${btn.primary} h-14`}>
          Finish workout
        </button>
      </div>
    </Sheet>
  );
}

import { Sheet } from "~/components/Sheet";
import { btn } from "~/ui/button";
import type { DaySheet as DaySheetModel } from "./model";

/** A future day: its lifts, then the move. The move itself is the move sheet's, so Plan and the workout share it. */
export function DaySheet({ sheet, onClose, onMove }: { sheet: DaySheetModel; onClose: () => void; onMove: () => void }) {
  return (
    <Sheet open onClose={onClose} title={sheet.title} dismiss="cancel">
      {sheet.workout && <p className="mb-2 text-[17px] font-bold">{sheet.workout}</p>}
      {sheet.lifts.length > 0 && (
        <ul className="mb-5 flex flex-col border-t border-rule">
          {sheet.lifts.map((l) => (
            <li key={l.name} className="flex min-h-12 items-center justify-between gap-3 border-b border-rule">
              <span className="text-[16px]">{l.name}</span>
              <span className="tabular whitespace-nowrap font-num text-[15px] font-bold text-ink-3">{l.sets}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onMove} className={`${btn.outline} h-14 w-full text-[16px]`}>
        {sheet.action === "move" ? "Move to another day" : "Train this day"}
      </button>
    </Sheet>
  );
}

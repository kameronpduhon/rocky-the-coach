import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { btn } from "~/ui/button";
import type { LiftView } from "./model";

/** A note on an exercise. It belongs to the exercise, so it shows every week. */
export function NoteSheet({ lift, onSave, onClose }: { lift: LiftView | null; onSave: (note: string) => void; onClose: () => void }) {
  const [text, setText] = useState(lift?.note ?? "");
  if (!lift) return null;
  return (
    <Sheet open onClose={onClose} title="Note">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(text);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="note" className="text-[15px] text-ink-3">
          For {lift.name.toLowerCase()}, every week.
        </label>
        <textarea id="note" value={text} maxLength={200} rows={3} onChange={(e) => setText(e.target.value)} className="rounded-[6px] border-[1.5px] border-border bg-field p-3 text-[17px] text-ink" />
        <button type="submit" className={`${btn.primary} h-14`}>
          Save note
        </button>
        {lift.note && (
          <button type="button" onClick={() => onSave("")} className={btn.quiet}>
            Clear note
          </button>
        )}
      </form>
    </Sheet>
  );
}

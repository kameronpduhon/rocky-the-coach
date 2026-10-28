import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import type { Slot } from "~/domain/types";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { closeOutLabel, type CloseOutModel, type CloseOutRow } from "./closeout";

/** Every unmarked meal starts checked, so the usual night is one tap. Un-check the ones you skipped (option 1C). */
export function CloseOutSheet({ day, onClose }: { day: CloseOutModel; onClose: () => void }) {
  const mutate = useMutate();
  const [skipped, setSkipped] = useState<Set<Slot>>(() => new Set());
  const toggle = (slot: Slot) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(slot)) next.add(slot);
      return next;
    });
  const entry = (r: CloseOutRow) => ({ clientId: crypto.randomUUID(), slot: r.slot, mealSlug: r.mealSlug });
  function save() {
    // closeOutDay leaves any slot already marked, on this phone or another, as it is.
    void mutate("closeOutDay", { date: day.date, eaten: day.rows.filter((r) => !skipped.has(r.slot)).map(entry), skipped: day.rows.filter((r) => skipped.has(r.slot)).map(entry) });
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={day.title} dismiss="none">
      <div className="flex flex-col gap-3.5">
        <p className="text-[16px] leading-[1.4] text-ink-2">Tap any you skipped.</p>
        <ul className="flex flex-col">
          {day.rows.map((r) => {
            const ate = !skipped.has(r.slot);
            return (
              <li key={r.slot} className="flex min-h-[60px] items-center gap-3 border-t border-rule last:border-b">
                <span className="flex flex-1 flex-col">
                  <span className={`text-[16px] ${ate ? "" : "text-muted"}`}>{r.name}</span>
                  <span className="text-[14px] tabular-nums text-muted">{ate ? r.sub : "Skipped"}</span>
                </span>
                <button
                  type="button"
                  aria-pressed={ate}
                  aria-label={`${r.name} eaten`}
                  onClick={() => toggle(r.slot)}
                  className={`flex size-11 flex-none items-center justify-center rounded-full ${ate ? "bg-ink text-paper" : "border-[1.5px] border-border"}`}
                >
                  {ate && <Icon name="check" size={18} strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={save} className={`${btn.primary} h-14`}>
          {closeOutLabel(day.rows.length - skipped.size, skipped.size)}
        </button>
        <div className="flex justify-center">
          <button type="button" onClick={onClose} className={btn.quiet}>
            Not now
          </button>
        </div>
      </div>
    </Sheet>
  );
}

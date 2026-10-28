import { useState } from "react";
import { FACT_MAX } from "~/ai/facts";
import { COACH_NAME } from "~/brand";
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import type { FactRow } from "./model";

/** What Rocky knows (spec section 5, item 3; mock Settings). Tap a fact to change it; × forgets it. */
export function FactsList({ facts, empty, onTell }: { facts: FactRow[]; empty: string | null; onTell: () => void }) {
  const mutate = useMutate();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col">
      <span id="knows" className="mb-1 text-[16px] font-bold">
        What {COACH_NAME} knows
      </span>
      {empty ? (
        <p className="text-[15px] leading-[1.4] text-ink-3">{empty}</p>
      ) : (
        <ul aria-labelledby="knows" className="flex flex-col border-b border-rule">
          {facts.map((f) => (
            <li key={f.key} className="flex min-h-[52px] items-center gap-2.5 border-t border-rule">
              {editing === f.key ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate("editFact", { key: f.key, text: draft });
                    setEditing(null);
                  }}
                >
                  <label htmlFor={`fact-${f.key}`} className="sr-only">
                    Change what {COACH_NAME} knows
                  </label>
                  <input
                    id={`fact-${f.key}`}
                    value={draft}
                    maxLength={FACT_MAX}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-11 min-w-0 basis-full rounded-[6px] border-[1.5px] border-border bg-field px-3 text-[15px] focus:border-2 focus:border-ink focus:outline-none"
                  />
                  <button type="submit" className={`${btn.outlinePlain} h-11 px-4 text-[15px]`}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className={btn.quiet}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(f.text);
                      setEditing(f.key);
                    }}
                    className="flex-1 py-2 text-left text-[15px] leading-[1.35]"
                  >
                    {f.shown}
                  </button>
                  <button type="button" aria-label={f.forget} onClick={() => void mutate("forgetFact", { key: f.key })} className="flex size-11 flex-none items-center justify-center text-ink-3">
                    <Icon name="close" size={18} strokeWidth={2.4} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onTell} className={`${btn.outlinePlain} mt-2.5 h-11 self-start px-3.5 text-[15px]`}>
        + Tell {COACH_NAME} something
      </button>
    </div>
  );
}

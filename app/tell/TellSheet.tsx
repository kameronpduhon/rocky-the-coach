import { useState } from "react";
import { FACT_LIMIT, FACT_MAX } from "~/ai/facts";
import { useAi } from "~/ai/use-ai";
import { COACH_NAME } from "~/brand";
import { Sheet } from "~/components/Sheet";
import { useMutate, useTable } from "~/sync/react";
import { btn } from "~/ui/button";

export const TELL_PLACEHOLDER = `Sore shoulder, travelling Thursday, anything ${COACH_NAME} should know`;

/**
 * "+ Tell Rocky something" (spec section 4, "The sheet, AI off or no key"). Until P5c it saves the note as written for
 * everyone, as a fact in What Rocky knows.
 */
export function TellSheet({ onClose }: { onClose: () => void }) {
  const ai = useAi();
  const mutate = useMutate();
  const full = useTable("facts").length >= FACT_LIMIT;
  const [text, setText] = useState("");

  async function save() {
    if (await mutate("rememberFact", { clientId: crypto.randomUUID(), text, dated: false })) onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`Tell ${COACH_NAME}`}>
      {full ? (
        <p className="text-[16px] leading-[1.45] text-ink-2">
          {COACH_NAME} knows {FACT_LIMIT} things. Forget one to add another.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="tell-note" className="sr-only">
            What should {COACH_NAME} know?
          </label>
          <textarea
            id="tell-note"
            rows={3}
            maxLength={FACT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={TELL_PLACEHOLDER}
            className="min-h-[92px] rounded-[6px] border-[1.5px] border-border bg-field px-3 py-[11px] text-[17px] leading-[1.4] focus:border-2 focus:border-ink focus:outline-none"
          />
          <p className="text-[14px] leading-[1.4] text-ink-3">{ai.on && ai.available !== false ? "This is saved as written." : `${COACH_NAME}'s AI is off, so this is saved as written.`}</p>
          <button type="button" disabled={!text.trim()} onClick={save} className={`${btn.outlinePlain} h-11 self-end px-4 disabled:opacity-50`}>
            Save
          </button>
        </div>
      )}
    </Sheet>
  );
}

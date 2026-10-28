import { useId, useState } from "react";
import { describeMeal } from "~/ai/client";
import type { DescribeReply } from "~/ai/describe";
import { COACH_NAME } from "~/brand";
import { btn } from "~/ui/button";
import { describeProblem } from "./offplan";

const MAX_CHARS = 300;

/** Describe it: a text box, and the model's foods on the plate. Failures keep the text in the box. */
export function DescribeView({ startText, onPlate, onType }: { startText: string; onPlate: (text: string, reply: DescribeReply) => void; onType: () => void }) {
  const id = useId();
  const [text, setText] = useState(startText);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const build = async () => {
    const said = text.trim();
    if (!said || busy) return;
    setBusy(true);
    setProblem(null);
    const reply = await describeMeal(said);
    setBusy(false);
    const why = describeProblem(reply);
    if (why || !reply) setProblem(why);
    else onPlate(said, reply);
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-3">
        What did you eat?
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Chipotle bowl, double chicken, white rice, black beans, fajita veg, salsa, guac"
        className="rounded-[6px] border-[1.5px] border-border bg-field px-3 py-2.5 text-[17px] leading-[1.4] text-ink"
      />
      <p className="text-[15px] leading-[1.4] text-ink-3">{COACH_NAME} splits it into foods. The food table sets the calories and protein.</p>
      {problem && (
        <p role="alert" className="text-[15px] leading-[1.4] text-ink-2">
          {problem}
        </p>
      )}
      <button type="button" disabled={busy || !text.trim()} onClick={() => void build()} className={`${btn.primary} mt-1 h-14 disabled:opacity-50`}>
        {busy ? "Building the plate" : "Build the plate"}
      </button>
      <button type="button" onClick={onType} className={btn.quiet}>
        Type the numbers instead
      </button>
    </div>
  );
}

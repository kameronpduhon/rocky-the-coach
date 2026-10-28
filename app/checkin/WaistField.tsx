import { useEffect, useState } from "react";

/** The waist cell's field. It saves on blur or Done, and only a changed number from 20 to 60. "was 35.75" sits inside, as the mock draws it. */
export function WaistField({ id, value, note, editable, onCommit }: { id: string; value: number | null; note: string | null; editable: boolean; onCommit: (inches: number) => void }) {
  const shown = value === null ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() === "" || !Number.isFinite(v) || v < 20 || v > 60 || v === value) return setText(shown);
    onCommit(v);
  };
  if (!editable) {
    // Read-only: the number keeps its full width and the note wraps under it, so "last measured Oct 25" never clips "35.5".
    return (
      <div className="flex min-h-11 flex-wrap content-center items-baseline gap-x-1.5">
        <output id={id} className="tabular font-num text-[24px] font-bold text-ink">
          {shown}
        </output>
        {note && <span className="whitespace-nowrap font-sans text-[14px] font-normal text-ink-3">{note}</span>}
      </div>
    );
  }
  return (
    <div className="flex h-11 items-center gap-1.5 rounded-[6px] border-[1.5px] border-ink bg-field px-2.5 has-[:focus]:outline-[2.5px] has-[:focus]:outline-offset-2 has-[:focus]:outline-red has-[:focus]:outline-solid">
      <input
        id={id}
        inputMode="decimal"
        enterKeyHint="done"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="tabular w-full min-w-0 flex-1 bg-transparent font-num text-[24px] font-bold text-ink outline-none"
      />
      {note && <span className="whitespace-nowrap font-sans text-[14px] font-normal text-ink-3">{note}</span>}
    </div>
  );
}

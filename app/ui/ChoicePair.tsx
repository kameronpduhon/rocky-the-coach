export interface PairOption<T extends string> {
  value: T;
  title: string;
  sub?: string;
}

/** The system's choice pair: two side by side, the picked one ink with paper text. */
export function ChoicePair<T extends string>({ label, options, value, onPick }: { label: string; options: [PairOption<T>, PairOption<T>]; value: T; onPick: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            className={`flex min-h-[52px] flex-col items-center justify-center rounded-[6px] px-2 py-1.5 text-center font-num text-[15px] font-bold leading-[1.2] ${on ? "border-2 border-ink bg-ink text-paper" : "border-[1.5px] border-border text-ink"}`}
          >
            {o.title}
            {o.sub && <span className={`text-[13px] font-semibold ${on ? "text-on-ink-2" : "text-ink-3"}`}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

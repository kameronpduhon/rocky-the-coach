export interface JoinedOption<T> {
  value: T;
  label: string;
}

/** The meal mocks' choice: one 1.5 px ink outline split into parts, the picked part filled ink ("Cooking for", "Just today / Always"). */
export function JoinedChoice<T extends string | number>({
  label,
  choices,
  value,
  onPick,
  height = "h-12",
}: {
  label: string;
  choices: JoinedOption<T>[];
  value: T;
  onPick: (value: T) => void;
  height?: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid overflow-hidden rounded-[6px] border-[1.5px] border-ink" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
      {choices.map((c, i) => {
        const on = c.value === value;
        return (
          <button
            key={String(c.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(c.value)}
            className={`${height} font-num text-[16px] font-bold ${i > 0 ? "border-l-[1.5px] border-ink" : ""} ${on ? "bg-ink text-paper" : "text-ink"}`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

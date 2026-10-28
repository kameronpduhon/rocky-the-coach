export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** One pick from a few: the workout picker (a scrolling row) and the feel buttons (a grid). Selected is ink. */
export function ChoiceRow<T extends string>({
  label,
  choices,
  value,
  onPick,
  layout = "row",
}: {
  label: string;
  choices: Choice<T>[];
  value: T | null;
  onPick: (value: T) => void;
  layout?: "row" | "grid";
}) {
  const grid = layout === "grid";
  return (
    <div
      role="group"
      aria-label={label}
      className={grid ? "grid gap-2" : "-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]"}
      style={grid ? { gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` } : undefined}
    >
      {choices.map((c) => {
        const on = c.value === value;
        const size = grid ? "h-12 text-[17px]" : "h-11 flex-none whitespace-nowrap px-3 text-[15px]";
        // The feel buttons keep the mock's ink outline; the picker's unselected ones are the quieter control border.
        const look = on ? "border-2 border-ink bg-ink text-paper" : grid ? "border-[1.5px] border-ink text-ink" : "border-[1.5px] border-border text-ink";
        return (
          <button key={c.value} type="button" aria-pressed={on} onClick={() => onPick(c.value)} className={`rounded-[6px] font-num font-bold ${size} ${look}`}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TapRow {
  label: string;
  choices: { value: string; label: string }[];
  value: string | null;
  onPick: (value: string | null) => void;
}

/** A label and three choices per row. The chosen one is ink; tapping it again clears it. */
export function TapGrid({ rows }: { rows: TapRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} role="group" aria-label={r.label} className="grid grid-cols-[70px_repeat(3,minmax(0,1fr))] items-center gap-2">
          <span className="text-[16px] font-semibold">{r.label}</span>
          {r.choices.map((c) => {
            const on = c.value === r.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => r.onPick(on ? null : c.value)}
                className={`h-11 rounded-[6px] border-[1.5px] font-num text-[15px] font-bold ${on ? "border-ink bg-ink text-paper" : "border-border text-ink"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

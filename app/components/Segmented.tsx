export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-[6px] font-num text-[16px] font-bold ${on ? "border-2 border-ink bg-ink text-paper" : "border-[1.5px] border-border text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
    <div role="group" aria-label={label} className="glass grid gap-0.5 rounded-[26px] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-[22px] text-[15px] ${on ? "segment-on font-semibold text-label" : "font-medium text-label-2"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

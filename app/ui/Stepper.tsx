import { useEffect, useId, useState } from "react";
import { btn } from "./button";

/** A set card: the label, a big number you can type into, and a pair of 48 px outline buttons that step it. */
export function Stepper({
  label,
  value,
  step,
  less,
  more,
  decimal = false,
  onChange,
}: {
  label: string;
  value: number | null;
  step: number;
  less: string;
  more: string;
  decimal?: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  // Follows the steppers without fighting the keyboard: "28." stays "28." while it still means 28.
  useEffect(() => {
    setText((t) => (t.trim() !== "" && Number(t) === value ? t : value === null ? "" : String(value)));
  }, [value]);
  const bump = (d: number) => onChange(Math.max(0, (value ?? 0) + d));
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border-2 border-ink bg-raised px-3 py-3.5">
      <label htmlFor={id} className="font-num text-[14px] font-bold uppercase tracking-[0.04em] text-ink-3">
        {label}
      </label>
      <input
        id={id}
        value={text}
        inputMode={decimal ? "decimal" : "numeric"}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          onChange(e.target.value.trim() === "" || !Number.isFinite(v) || v < 0 ? null : v);
        }}
        className="tabular w-full min-w-0 bg-transparent text-center font-num text-[56px] font-bold leading-none outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-label={less} onClick={() => bump(-step)} className={`${btn.outline} h-12 text-[18px]`}>
          −{step}
        </button>
        <button type="button" aria-label={more} onClick={() => bump(step)} className={`${btn.outline} h-12 text-[18px]`}>
          +{step}
        </button>
      </div>
    </div>
  );
}

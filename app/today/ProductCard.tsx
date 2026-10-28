import { useState } from "react";
import { Icon } from "~/components/ui";
import { Toggle } from "~/components/Toggle";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { cardEdit, cardLog, cardReady, NO_PROTEIN, sourceLine, stepperFor, type CardSource, type FormValues } from "./offplan";
import { FIELD, LABEL } from "./SomethingNewForm";

function BigNumber({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular font-num text-[34px] font-bold leading-none">{value}</span>
      <span className="text-[14px] font-semibold text-ink-3">{unit}</span>
    </div>
  );
}

/** Option 3B: one product per serving (or per 100 g), a stepper, and Log it. Used for a barcode and a label. */
export function ProductCard({ date, card, onEdit, onDone }: { date: string; card: CardSource; onEdit: (values: FormValues) => void; onDone: () => void }) {
  const mutate = useMutate();
  const stepper = stepperFor(card);
  const [count, setCount] = useState(stepper.start);
  const [name, setName] = useState(card.name ?? "");
  const [saveUsual, setSaveUsual] = useState(false);
  const [protein, setProtein] = useState("");
  const log = cardLog(card, count, name, protein);
  const ready = cardReady(card, count, name, protein);
  const step = (d: number) => setCount((c) => Math.min(stepper.max, Math.max(stepper.min, c + d)));

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Product" className="flex flex-col gap-3.5 rounded-[6px] border-[1.5px] border-rule bg-raised p-4">
        <div className="flex flex-col gap-0.5">
          {card.name ? (
            <h3 className="text-[17px] font-bold leading-[1.3]">{card.name}</h3>
          ) : (
            <label className={LABEL}>
              What was it
              <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
            </label>
          )}
          <p className="text-[14px] text-ink-3">{sourceLine(card)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <BigNumber value={card.kcal.toLocaleString("en-US")} unit="cal" />
          {card.proteinG === null ? (
            <label className={LABEL}>
              Protein, g
              <input inputMode="decimal" required value={protein} onChange={(e) => setProtein(e.target.value)} className={`tabular ${FIELD}`} />
            </label>
          ) : (
            <BigNumber value={`${Math.round(card.proteinG)} g`} unit="protein" />
          )}
        </div>
        {card.proteinG === null && <p className="-mt-1.5 text-[14px] leading-[1.4] text-ink-3">{NO_PROTEIN}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-rule pt-3">
          <span className="text-[16px] font-semibold">{stepper.label}</span>
          <div className="flex items-center">
            <button type="button" aria-label={`Fewer ${stepper.label.toLowerCase()}`} disabled={count <= stepper.min} onClick={() => step(-stepper.step)} className={`${btn.outline} size-11 disabled:border-border disabled:text-muted`}>
              <Icon name="minus" size={16} strokeWidth={2.6} />
            </button>
            <span className="tabular w-[72px] text-center font-num text-[17px] font-bold" aria-live="polite">
              {count}
              {stepper.unit}
            </span>
            <button type="button" aria-label={`More ${stepper.label.toLowerCase()}`} disabled={count >= stepper.max} onClick={() => step(stepper.step)} className={`${btn.outline} size-11 disabled:border-border disabled:text-muted`}>
              <Icon name="plus" size={16} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </section>
      {card.from === "label" && <p className="-mt-1 text-[14px] text-ink-3">Check it against the wrapper.</p>}
      <button type="button" onClick={() => onEdit(cardEdit(card, count, name, protein))} className={`${btn.quiet} -mt-1.5`}>
        Numbers look wrong? Edit them
      </button>
      <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
        <span>Save as a usual</span>
        <Toggle on={saveUsual} label="Save as a usual" onChange={setSaveUsual} />
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          void mutate("logOffPlan", { clientId: crypto.randomUUID(), date, ...log, relaxed: false, usualId: saveUsual ? crypto.randomUUID() : undefined });
          onDone();
        }}
        className={`${btn.primary} h-14 disabled:opacity-50`}
      >
        Log it
      </button>
    </div>
  );
}

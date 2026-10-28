import type { ReactNode } from "react";
import { COACH_NAME } from "~/brand";

const BAR = "block h-3.5 rounded-[3px] bg-on-ink-2/30";

/**
 * The dark card in Rocky's voice. With `rows`, each row is a bold label (WIN, FIX, CALL) and a line. `prose` is the
 * AI-written take (option 5A: the same card, no label saying who wrote it). `placeholder` holds its place while it is
 * written: three static bars, nothing animated.
 */
export function RockyCard({
  label,
  children,
  rows,
  prose,
  placeholder,
  action,
}: {
  label: string;
  children?: ReactNode;
  rows?: { label: string; text: string }[];
  prose?: string;
  placeholder?: boolean;
  /** A row under the body, after a hairline rule: Today's "Tell Rocky something". */
  action?: ReactNode;
}) {
  return (
    <section aria-label={COACH_NAME} aria-busy={placeholder || undefined} className="flex flex-col gap-2 rounded-[6px] bg-ink px-[18px] pb-5 pt-[18px] text-paper">
      <h2 className="font-num text-[14px] font-bold uppercase tracking-[0.06em] text-coral">{label}</h2>
      {placeholder ? (
        <div aria-hidden="true" className="flex flex-col gap-2.5 py-1.5">
          <span className={`${BAR} w-full`} />
          <span className={`${BAR} w-[92%]`} />
          <span className={`${BAR} w-[64%]`} />
        </div>
      ) : prose !== undefined ? (
        <p className="text-[18px] font-medium leading-[1.45]">{prose}</p>
      ) : rows ? (
        <dl className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
              <dt className="pt-[3px] font-num text-[14px] font-bold uppercase tracking-[0.06em] text-on-ink-2">{r.label}</dt>
              <dd className="text-[17px] font-medium leading-[1.4]">{r.text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[19px] font-medium leading-[1.4]">{children}</p>
      )}
      {action && <div className="mt-1 border-t border-paper/20 pt-1">{action}</div>}
    </section>
  );
}

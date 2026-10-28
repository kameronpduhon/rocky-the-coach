import type { ReactNode } from "react";
import { COACH_NAME } from "~/brand";

/** The dark card in Rocky's voice. With `rows`, each row is a bold label (WIN, FIX, CALL) and a line. */
export function RockyCard({ label, children, rows }: { label: string; children?: ReactNode; rows?: { label: string; text: string }[] }) {
  return (
    <section aria-label={COACH_NAME} className="flex flex-col gap-2 rounded-[6px] bg-ink px-[18px] pb-5 pt-[18px] text-paper">
      <h2 className="font-num text-[14px] font-bold uppercase tracking-[0.06em] text-coral">{label}</h2>
      {rows ? (
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
    </section>
  );
}

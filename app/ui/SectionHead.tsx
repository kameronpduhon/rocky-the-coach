import type { ReactNode } from "react";

export function SectionHead({ id, note, children }: { id: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
      <h2 id={id} className="font-display text-[28px] uppercase">
        {children}
      </h2>
      {note && <span className="font-num text-[15px] font-semibold text-muted">{note}</span>}
    </div>
  );
}

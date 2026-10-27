import type { ReactNode } from "react";
import { COACH_NAME } from "~/brand";

export function RockyCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={COACH_NAME} className="flex flex-col gap-2 rounded-[6px] bg-ink px-[18px] pb-5 pt-[18px] text-paper">
      <h2 className="font-num text-[14px] font-bold uppercase tracking-[0.06em] text-coral">{label}</h2>
      <p className="text-[19px] font-medium leading-[1.4]">{children}</p>
    </section>
  );
}

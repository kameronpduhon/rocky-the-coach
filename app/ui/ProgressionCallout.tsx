import type { ReactNode } from "react";

/** Brass, and only for progression. */
export function ProgressionCallout({ tag = "Go up", children }: { tag?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[6px] border-[1.5px] border-brass-border bg-brass-fill px-3.5 py-3">
      <span className="flex-none rounded-[3px] bg-brass-tag px-[7px] py-[3px] font-num text-[13px] font-bold uppercase tracking-[0.06em] text-brass-on">{tag}</span>
      <span className="text-[16px] leading-[1.4] text-ink-2">{children}</span>
    </div>
  );
}

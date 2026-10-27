const base = "inline-flex items-center justify-center rounded-[6px] font-num font-bold";

/** Button looks from the system: one red primary per screen, ink outlines, and quiet underlined links. */
export const btn = {
  primary: `${base} bg-red text-on-red text-[19px] uppercase tracking-[0.04em]`,
  // The gym's 64 px primary, at 21 px (system.md, "Primary button").
  gym: `${base} bg-red text-on-red text-[21px] uppercase tracking-[0.04em]`,
  // No font size: each use sets its own, so two sizes never fight.
  outline: `${base} border-[1.5px] border-ink text-ink`,
  // The same outline for sentence-case labels in Barlow ("+ Ate something else").
  outlinePlain: "inline-flex items-center justify-center rounded-[6px] border-[1.5px] border-ink text-ink text-[16px] font-semibold",
  quiet: "inline-flex h-11 items-center self-start text-[16px] font-semibold text-ink-3 underline decoration-underline underline-offset-4",
};

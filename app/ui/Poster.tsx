import type { ReactNode } from "react";

/** The headline that says what's next, one line under it, then whatever acts on it. */
export function Poster({ lines, meta, children }: { lines: string[]; meta: string; children?: ReactNode }) {
  // Long meal names wrap at 64 px instead of running off the screen at 68.
  const long = lines.some((l) => l.length > 12);
  return (
    <section aria-labelledby="next-up" className="flex flex-col gap-4">
      <h1 id="next-up" className={`font-display uppercase leading-[0.92] [overflow-wrap:anywhere] ${long ? "text-[64px]" : "text-[68px]"}`}>
        {lines.map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
      </h1>
      <p className="font-num text-[18px] font-semibold text-ink-3">{meta}</p>
      {children}
    </section>
  );
}

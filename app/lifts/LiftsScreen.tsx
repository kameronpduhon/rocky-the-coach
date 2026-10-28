import { Link } from "react-router";
import { HeaderIcon } from "~/ui/GymFrame";
import { SectionHead } from "~/ui/SectionHead";
import { Sparkline } from "~/ui/Sparkline";
import type { LiftsModel } from "./model";

/** Option 6A: every lift by body part, with its best set, the last 4 sessions and the gain. */
export function LiftsScreen({ m }: { m: LiftsModel }) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <HeaderIcon to="/progress" label="Back to Progress" icon="back" />
        <span className="font-num text-[16px] font-bold tracking-[0.02em]">PROGRESS</span>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-none">{m.title}</h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{m.meta}</p>
      </section>
      {m.sections.map((s) => (
        <section key={s.part} aria-labelledby={`part-${s.part}`} className="flex flex-col">
          <SectionHead id={`part-${s.part}`} note={String(s.rows.length)}>
            {s.label}
          </SectionHead>
          <ul className="flex flex-col">
            {s.rows.map((r) => (
              <li key={r.id}>
                <Link to={`/lift/${r.id}?from=progress`} className="flex min-h-[60px] items-center gap-3 border-b border-rule py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] font-semibold">{r.name}</span>
                    <span className="text-[13px] text-ink-3">{r.sub}</span>
                  </span>
                  <Sparkline values={r.spark} />
                  <span className="tabular w-[54px] flex-none text-right font-num text-[16px] font-bold">
                    <span className="sr-only">Gain </span>
                    {r.gain}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

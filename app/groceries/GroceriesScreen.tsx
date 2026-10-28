import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { HeaderIcon } from "~/ui/GymFrame";
import { SectionHead } from "~/ui/SectionHead";
import type { GroceriesModel, GroceryRow } from "./model";

/** Option 5A: aisles in store order, a check circle per food, and checked rows that stay put, muted. */
export function GroceriesScreen({ m, fromCheckIn }: { m: GroceriesModel; fromCheckIn: boolean }) {
  const mutate = useMutate();
  const toggle = (r: GroceryRow) => void mutate("checkGrocery", { week: m.monday, food: r.food, checked: !r.checked });
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <HeaderIcon to={fromCheckIn ? "/check-in" : "/plan"} label={fromCheckIn ? "Back to the check-in" : "Back to Plan"} icon="back" />
        <span className="font-num text-[16px] font-bold tracking-[0.02em]">{m.header}</span>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-none">Groceries.</h1>
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="tabular font-num text-[34px] font-bold leading-none">
            {m.checked} of {m.count}
          </span>
          <span className="font-num text-[16px] font-semibold text-ink-3">in the cart · at {m.kcal.toLocaleString("en-US")} cal</span>
        </p>
        {m.preview && <p className="text-[15px] leading-[1.45] text-ink-2">Built from next week's meals as the check-in has them. It updates when you finish.</p>}
      </section>

      {m.count === 0 && <p className="text-[16px] text-ink-3">No meals planned for this week yet.</p>}
      {m.sections.map((s) => (
        <section key={s.section} aria-labelledby={`aisle-${s.section}`} className="flex flex-col">
          <SectionHead id={`aisle-${s.section}`} note={`${s.done} of ${s.rows.length}`}>
            {s.label}
          </SectionHead>
          <ul className="flex flex-col">
            {s.rows.map((r) => (
              <li key={r.food}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={r.checked}
                  onClick={() => toggle(r)}
                  className="flex min-h-[60px] w-full items-center gap-3 border-b border-rule py-2 text-left"
                >
                  <span aria-hidden="true" className={`flex size-11 flex-none items-center justify-center rounded-full ${r.checked ? "bg-ink text-paper" : "border-[1.5px] border-border"}`}>
                    {r.checked && <Icon name="check" size={20} strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-[16px] font-semibold ${r.checked ? "text-muted line-through decoration-underline" : ""}`}>{r.name}</span>
                    {r.sub && <span className="text-[13px] text-ink-3">{r.sub}</span>}
                  </span>
                  <span className={`tabular whitespace-nowrap font-num text-[20px] font-bold ${r.checked ? "text-muted" : ""}`}>
                    {r.grams.toLocaleString("en-US")}
                    <span className="ml-0.5 text-[14px] font-semibold text-ink-3">g</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

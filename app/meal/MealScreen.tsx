import { useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { JoinedChoice } from "~/ui/JoinedChoice";
import { SectionHead } from "~/ui/SectionHead";
import { BatchCard } from "./BatchCard";
import { MealSwapSheet } from "./MealSwapSheet";
import { batchMeta, scaleRows, type MealModel } from "./model";
import { PhotoBox } from "./PhotoBox";

const PORTIONS = [
  { value: 1, label: "Just today" },
  { value: 2, label: "2 days" },
  { value: 3, label: "3 days" },
];

/** Today's slot (mocks MealOne, MealBatch, MealLeftover, MealSwap) or browse mode (option 2A). */
export function MealScreen({ m, fromLibrary }: { m: MealModel; fromLibrary: boolean }) {
  const navigate = useNavigate();
  const mutate = useMutate();
  const [portions, setPortions] = useState(1);
  const [swapping, setSwapping] = useState(false);
  const shown = m.todayBatch?.portions ?? (m.canCook ? portions : 1);
  const rows = scaleRows(m, shown);
  const firstWas = rows.findIndex((r) => r.was !== null);
  const back = fromLibrary ? "/library" : "/";
  // The screen follows the slot to its new meal, and Back still goes where it came from.
  const openSlot = (slug: string, slot: string) => navigate(`/meal/${slug}?slot=${slot}${fromLibrary ? "&from=library" : ""}`, { replace: true });

  async function haveIt() {
    if (!m.haveIt) return;
    if (await mutate("swapMeal", { date: m.date, slot: m.haveIt.slot, mealSlug: m.meal.slug, always: false })) openSlot(m.meal.slug, m.haveIt.slot);
  }

  const header = (
    <>
      <HeaderIcon to={back} label={fromLibrary ? "Back to Library" : "Back to Today"} icon="back" />
      {m.mode === "today" && m.state === "open" && (
        <button type="button" onClick={() => setSwapping(true)} className="flex h-11 items-center gap-1.5 rounded-[6px] border-[1.5px] border-border px-3.5 font-num text-[16px] font-bold">
          <Icon name="swap" size={16} />
          Swap
        </button>
      )}
    </>
  );

  return (
    <GymFrame header={header} dock={<MealDock m={m} portions={shown} onHaveIt={() => void haveIt()} />} gap="gap-5">
      <PhotoBox slug={m.meal.slug} photoKey={m.photoKey} alt={m.meal.name} />

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[54px] uppercase leading-[0.95] [overflow-wrap:anywhere]">{m.meal.name}.</h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{shown > 1 ? batchMeta(m, shown) : m.meta}</p>
        {m.restingUntil && <p className="text-[16px] text-ink-2">Resting to {m.restingUntil}</p>}
      </section>

      {m.canCook && <JoinedChoice label="Cooking for" choices={PORTIONS} value={portions} onPick={setPortions} />}

      <section aria-labelledby="scale" className="flex flex-col">
        <SectionHead id="scale">{shown > 1 ? `On the scale, all ${shown}` : "On the scale"}</SectionHead>
        <ul className="mt-1.5 flex flex-col">
          {rows.map((r, i) => (
            <li key={r.food} className={`flex flex-col justify-center gap-1 border-b border-rule ${r.highlight ? "-mx-3 min-h-[72px] bg-raised px-3" : r.was ? "min-h-[84px]" : "min-h-[62px]"}`}>
              <div className="flex items-center gap-3">
                <span className="flex flex-1 flex-col">
                  <span className={r.highlight ? "text-[18px] font-bold" : "text-[17px] font-semibold"}>{r.name}</span>
                  {r.sub && <span className={`text-[14px] ${r.highlight ? "text-ink-3" : "text-muted"}`}>{r.sub}</span>}
                </span>
                <span className={`tabular font-num font-bold ${r.highlight ? "text-[40px]" : "text-[34px]"}`}>
                  {r.grams.toLocaleString()}
                  <span className={r.highlight ? "text-[20px]" : "text-[18px]"}> g</span>
                </span>
              </div>
              {r.was && <span className="text-[14px] text-ink-2">{i === firstWas && m.wasNote ? `${r.was} ${m.wasNote}` : r.was}</span>}
            </li>
          ))}
        </ul>
      </section>

      {m.leftover && <p className="text-[17px] leading-[1.45]">{m.leftover.closing}</p>}
      {(m.todayBatch || (m.canCook && portions > 1)) && <BatchCard m={m} portions={shown} />}

      {!m.leftover && (
        <section aria-labelledby="steps" className="flex flex-col gap-3">
          <SectionHead id="steps">Steps</SectionHead>
          <ol className="flex flex-col gap-3 text-[17px] leading-[1.4]">
            {m.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-[22px] flex-none font-num font-bold text-muted">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {swapping && <MealSwapSheet m={m} onClose={() => setSwapping(false)} onSwapped={(slug) => openSlot(slug, m.slot!)} />}
    </GymFrame>
  );
}

function MealDock({ m, portions, onHaveIt }: { m: MealModel; portions: number; onHaveIt: () => void }) {
  const mutate = useMutate();
  if (m.mode === "browse") {
    if (!m.haveIt) return null;
    return (
      <Dock>
        <p className="text-center text-[15px] text-ink-3">{m.haveIt.then}</p>
        <button type="button" onClick={onHaveIt} className={`${btn.outline} h-14 text-[17px] uppercase tracking-[0.02em]`}>
          {m.haveIt.label}
        </button>
      </Dock>
    );
  }
  if (m.state !== "open") {
    return (
      <Dock>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="font-num text-[19px] font-bold">{m.state === "eaten" ? `Eaten at ${m.eatenAt}` : "Skipped"}</span>
          <button type="button" onClick={() => void mutate("unlogMeal", { key: m.logKey })} className={btn.quiet}>
            Undo
          </button>
        </div>
      </Dock>
    );
  }
  const args = { date: m.date, slot: m.slot, mealSlug: m.meal.slug };
  const label = m.leftover ? `Ate it · ${m.meal.kcal} cal · ${m.meal.protein} g` : portions > 1 ? "Ate today's portion" : "Ate it";
  return (
    <Dock>
      <button type="button" onClick={() => void mutate("logMeal", { clientId: crypto.randomUUID(), ...args })} className={`${btn.gym} h-[60px] w-full`}>
        {label}
      </button>
      <div className="flex justify-center">
        <button type="button" onClick={() => void mutate("skipMeal", { clientId: crypto.randomUUID(), ...args })} className={btn.quiet}>
          Skipped it
        </button>
      </div>
    </Dock>
  );
}

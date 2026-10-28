import { SectionHead } from "~/ui/SectionHead";
import type { CallPick, CallView, ScaleList } from "./call";

/** The check-in's call (option 4A): the number, why, the pick, and what moves on the scale. Project 4's ritual reuses it. */
export function CallBlock({ view, choice, onChoice, changes }: { view: CallView; choice: CallPick; onChoice: (pick: CallPick) => void; changes: ScaleList }) {
  return (
    <section aria-labelledby="call" className="flex flex-col gap-6 text-ink">
      <div className="flex flex-col gap-2">
        <SectionHead id="call">The call.</SectionHead>
        <p className="mt-1.5 flex items-baseline gap-2.5">
          <span className="tabular font-num text-[64px] font-bold leading-none">{view.kcal.toLocaleString("en-US")}</span>
          <span className="font-num text-[18px] font-semibold leading-[1.2] text-ink-3">
            {view.unit}
            <br />
            {view.was}
          </span>
        </p>
        <p className="tabular flex flex-wrap gap-x-[18px] font-num text-[17px] font-bold">
          <span>{view.protein}</span>
          <span>{view.steps}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[18px] font-bold">Why</h3>
        <ol className="flex flex-col gap-2 text-[16px] leading-[1.45]">
          {view.why.map((line, i) => (
            <li key={line} className="flex gap-2.5">
              <span aria-hidden="true" className="w-[18px] flex-none font-num font-bold text-muted">
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        {view.note && (
          <p className="flex items-center gap-2 rounded-[6px] border-[1.5px] border-border px-3 py-2.5 text-[14px] text-ink-2">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {view.note}
          </p>
        )}
      </div>

      {view.options.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[18px] font-bold">Your pick</legend>
          {view.options.map((o) => {
            const on = o.value === choice;
            return (
              <label
                key={o.value}
                className={`flex cursor-pointer gap-3 rounded-[6px] p-3.5 has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-red has-[:focus-visible]:outline-solid ${on ? "border-2 border-ink bg-raised" : "border-[1.5px] border-border"}`}
              >
                <input type="radio" name="call-pick" value={o.value} checked={on} onChange={() => onChoice(o.value)} className="sr-only" />
                <span aria-hidden="true" className={`mt-px flex size-[22px] flex-none items-center justify-center rounded-full border-2 ${on ? "border-ink" : "border-border"}`}>
                  {on && <span className="size-2.5 rounded-full bg-ink" />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[17px] font-bold">{o.title}</span>
                  <span className="text-[14px] text-ink-3">{o.sub}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {(changes.rows.length > 0 || changes.alsoTrim) && (
        <div className="flex flex-col">
          <h3 className="mb-1 text-[18px] font-bold">On your scale from Monday</h3>
          <ul className="flex flex-col border-t-2 border-ink">
            {changes.rows.map((c) => (
              <li key={`${c.food}-${c.from}`} className="flex min-h-[52px] items-center justify-between gap-2.5 border-b border-rule py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[16px] font-semibold">{c.name}</span>
                  <span className="text-[13px] text-muted">{c.meals}</span>
                </span>
                <span className="tabular flex-none whitespace-nowrap font-num text-[20px] font-bold">
                  {c.from} <span aria-hidden="true">→</span>
                  <span className="sr-only">to</span> {c.to} g
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex flex-col gap-1 text-[15px] text-ink-3">
            {changes.alsoTrim && <p>{changes.alsoTrim}</p>}
            <p>Chicken, steak, fish and eggs never shrink.</p>
          </div>
        </div>
      )}
    </section>
  );
}

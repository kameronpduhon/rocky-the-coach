import { Link } from "react-router";
import { Icon } from "~/components/ui";
import { GoUpTag } from "~/ui/GoUpTag";
import { HeaderIcon } from "~/ui/GymFrame";
import { SectionHead } from "~/ui/SectionHead";
import { monthDay, type LiftPage } from "./model";

/** Top weight per session, dated under the line. */
function SessionChart({ points, unit }: { points: LiftPage["chart"]; unit: string }) {
  const W = 350;
  const H = 96;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (points.length === 1 ? W / 2 : 10 + (i * (W - 20)) / (points.length - 1));
  const y = (v: number) => (hi === lo ? H / 2 : H - 12 - ((v - lo) * (H - 28)) / (hi - lo));
  const first = points[0];
  const last = points.at(-1)!;
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Top ${unit === "reps" ? "reps" : "weight"} per session, ${first.value} on ${monthDay(first.date)} to ${last.value} on ${monthDay(last.date)}.`}>
        <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="var(--rule)" />
        {points.length > 1 && (
          <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.map((p, i) => (
          <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 5 : 4} fill="var(--ink)" />
        ))}
      </svg>
      <figcaption className="flex justify-between font-num text-[13px] font-semibold text-ink-3">
        <span>{`${monthDay(first.date)} · ${first.value}`}</span>
        {points.length > 1 && <span className="font-bold text-ink">{`${monthDay(last.date)} · ${last.value}`}</span>}
      </figcaption>
    </figure>
  );
}

/** Option 7A: one lift's page, from the Library or All lifts. */
export function LiftScreen({ p }: { p: LiftPage }) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <HeaderIcon to={p.back.to} label={p.back.label} icon="back" />
        <span className="truncate font-num text-[16px] font-bold tracking-[0.02em]">{p.header}</span>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-none [overflow-wrap:anywhere]">{p.title}</h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{p.meta}</p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        {p.images.map((src, i) => (
          <figure key={src} className="flex flex-col gap-1">
            <img src={src} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-[6px] bg-well object-cover" />
            <figcaption className="text-[13px] text-ink-3">{i === 0 ? "Start" : "Finish"}</figcaption>
          </figure>
        ))}
      </div>

      {p.best ? (
        <>
          <section aria-label="Best set" className="flex items-end justify-between gap-3 border-t-2 border-ink pt-3">
            <span className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-ink-3">Best set</span>
              <span className="tabular font-num text-[34px] font-bold leading-none">
                {p.best.text}
                <span className="ml-1 text-[18px] font-semibold text-ink-3">{p.best.unit}</span>
              </span>
            </span>
            <span className="flex flex-col items-end gap-1.5">
              {p.best.goUp && <GoUpTag />}
              <span className="font-num text-[15px] font-semibold text-ink-3">{p.best.change}</span>
            </span>
          </section>
          <SessionChart points={p.chart} unit={p.best.unit} />
          <section aria-labelledby="history" className="flex flex-col">
            <SectionHead id="history">History</SectionHead>
            <ul className="flex flex-col">
              {p.history.map((h, i) => {
                const body = (
                  <>
                    <span className="w-16 flex-none font-num text-[15px] font-bold text-ink-3">{h.label}</span>
                    <span className="tabular flex-1 font-num text-[19px] font-bold">{h.sets}</span>
                    {h.next && <span className="text-[14px] text-ink-3">{h.next}</span>}
                    {h.goUp && <GoUpTag />}
                  </>
                );
                const cls = "flex min-h-[52px] items-center gap-3 border-b border-rule";
                return <li key={`${h.date}-${i}`}>{h.to ? <Link to={h.to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
              })}
            </ul>
          </section>
        </>
      ) : (
        <p className="border-t-2 border-ink pt-3 text-[16px] text-ink-2">No sets logged yet.</p>
      )}

      {p.swaps.length > 0 && (
        <section aria-labelledby="swaps" className="flex flex-col">
          <SectionHead id="swaps" note={p.swapsNote}>
            Swaps
          </SectionHead>
          <ul className="flex flex-col">
            {p.swaps.map((s) => (
              <li key={s.id}>
                <Link to={s.to} className="flex min-h-[58px] items-center gap-3 border-b border-rule py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] font-semibold">{s.name}</span>
                    <span className="text-[13px] text-ink-3">{s.equipment}</span>
                  </span>
                  <span className="text-ink-3">
                    <Icon name="chevron" size={16} strokeWidth={2.4} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

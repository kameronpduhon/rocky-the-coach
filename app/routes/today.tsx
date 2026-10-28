import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAi } from "~/ai/use-ai";
import { COACH_NAME, pageTitle } from "~/brand";
import { Icon } from "~/components/ui";
import { plan } from "~/content";
import { useNow } from "~/lib/use-now";
import { useMe } from "~/me";
import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { TellLine } from "~/tell/TellLine";
import { TellSheet } from "~/tell/TellSheet";
import type { CloseOutModel } from "~/today/closeout";
import { CloseOutSheet } from "~/today/CloseOutSheet";
import { buildToday, mealHeadline, scaleList, SLOT_LABEL, type NoPlanToday, type PlanToday, type SlotModel, type TrainingModel } from "~/today/model";
import { OffPlanSheet } from "~/today/OffPlanSheet";
import { btn } from "~/ui/button";
import { Poster } from "~/ui/Poster";
import { ProgressionCallout } from "~/ui/ProgressionCallout";
import { ProteinBar } from "~/ui/ProteinBar";
import { RockyCard } from "~/ui/RockyCard";
import { SectionHead } from "~/ui/SectionHead";
import { WeekStrip } from "~/ui/WeekStrip";

export function meta() {
  return [{ title: pageTitle("Today") }];
}

export default function Today() {
  const layout = useMe();
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const model = useMemo(
    () => (client && ready && layout ? buildToday((t) => client.store.rows(t), new Date(minute * 60_000), layout.hasPlan) : null),
    [client, ready, layout, version, minute],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return model.hasPlan ? <TodayWithPlan m={model} /> : <PlanOnTheWay m={model} name={layout!.name} />;
}

function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-5 pb-12 pt-[max(16px,env(safe-area-inset-top))]">{children}</main>;
}

function Header({ m }: { m: NoPlanToday | PlanToday }) {
  return (
    <header className="flex items-center justify-between gap-3 font-num text-[16px] font-bold tracking-[0.04em]">
      <span className="whitespace-nowrap">{m.dateLabel}</span>
      <div className="flex items-center gap-3">
        {m.streak > 0 && (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true" className="size-3 rounded-[2px] bg-ink" />
            {m.streak}-DAY STREAK
          </span>
        )}
        <Link to="/settings" aria-label="Settings" className="flex size-11 items-center justify-center rounded-[6px] border-[1.5px] border-border">
          <Icon name="gear" />
        </Link>
      </div>
    </header>
  );
}

function WeighInRow({ date }: { date: string }) {
  const mutate = useMutate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const weight = Number(value);
        if (!Number.isFinite(weight) || weight < 80 || weight > 500) return setError("Enter your weight in pounds.");
        setError(null);
        void mutate("logWeighIn", { date, weightLb: weight });
      }}
      className="flex flex-col gap-1.5 border-y border-rule py-3"
    >
      <div className="flex items-center gap-3">
        <label htmlFor="weight" className="flex-1 text-[16px] font-bold">
          Weigh in
        </label>
        <div className="flex h-11 w-[120px] items-center gap-1.5 rounded-[6px] border-[1.5px] border-border bg-field px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red">
          <input
            id="weight"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="tabular w-full min-w-0 bg-transparent text-right text-[18px] font-bold outline-none"
          />
          <span className="text-[15px] text-ink-3">lb</span>
        </div>
        <button type="submit" className={`${btn.outline} h-11 px-4 text-[16px]`}>
          Save
        </button>
      </div>
      {error && <p className="text-[14px] text-ink-2">{error}</p>}
    </form>
  );
}

function PlanOnTheWay({ m, name }: { m: NoPlanToday; name: string }) {
  return (
    <Page>
      <Header m={m} />
      {m.weighIn ? (
        <p className="tabular font-num text-[16px] font-semibold text-ink-3">
          Weigh-in {m.weighIn.weight} lb · {m.weighIn.time}
        </p>
      ) : (
        <WeighInRow date={m.date} />
      )}
      <Poster lines={["Your plan", "is on the way."]} meta={`Weigh in each morning and keep your steps syncing, ${name}. Your plan starts from real numbers.`} />
      <p className="text-[16px] tabular-nums text-ink-2">{m.steps.toLocaleString()} steps today</p>
    </Page>
  );
}

const ASKED_KEY = "rocky-closeout-asked";
let askedInMemory: string | null = null;

/** True the first time Today opens on `date` on this phone, so yesterday's sheet asks once a day and no more. */
function firstOpenOn(date: string): boolean {
  let asked = askedInMemory;
  try {
    asked = localStorage.getItem(ASKED_KEY) ?? asked;
    localStorage.setItem(ASKED_KEY, date);
  } catch {
    // Private mode can refuse storage. This page's memory still stops a second ask.
  }
  askedInMemory = date;
  return asked !== date;
}

function TodayWithPlan({ m }: { m: PlanToday }) {
  const [offPlanOpen, setOffPlanOpen] = useState(false);
  const [closing, setClosing] = useState<CloseOutModel | null>(null);
  const ai = useAi();
  const [telling, setTelling] = useState(false);
  const [params, setParams] = useSearchParams();
  // Checks that were already there when the screen opened do not animate. Nothing moves on load.
  const eatenAtOpen = useRef<Set<string> | null>(null);
  eatenAtOpen.current ??= new Set(m.slots.filter((s) => s.logKey).map((s) => s.slot));

  // Once, as the screen opens: the 9:15pm push asks about today, and a day's first open about a half-answered yesterday.
  useEffect(() => {
    if (params.get("closeout") === "today") {
      setParams(
        (p) => {
          p.delete("closeout");
          return p;
        },
        { replace: true },
      );
      setClosing(m.closeOut.today);
    } else if (m.closeOut.yesterday && firstOpenOn(m.date)) {
      setClosing(m.closeOut.yesterday);
    }
  }, []);

  return (
    <Page>
      <Header m={m} />
      {!m.weighIn && <WeighInRow date={m.date} />}
      <div className="flex flex-col gap-2">
        <NextUpPoster m={m} />
        {m.canChange && (
          <Link to="/workout" className={btn.quiet}>
            Change today's workout
          </Link>
        )}
        {m.optional && (
          <Link to={`/workout?template=${m.optional.templateId}`} className={btn.quiet}>
            Optional: {m.optional.name}, 30 min
          </Link>
        )}
      </div>

      <RockyCard
        label={m.voice === "plain" ? COACH_NAME : `${COACH_NAME}, in your corner`}
        action={ai.on && ai.available === true ? <TellLine onTap={() => setTelling(true)} /> : undefined}
      >
        {m.message}
      </RockyCard>

      <Fuel m={m} eatenAtOpen={eatenAtOpen.current} onAteElse={() => setOffPlanOpen(true)} onCloseOut={() => setClosing(m.closeOut.today)} />

      <section aria-labelledby="week" className="flex flex-col gap-3">
        <SectionHead id="week" note={`${m.countedSoFar} of ${m.daysSoFar} so far`}>
          This week
        </SectionHead>
        <WeekStrip days={m.week} />
        <p className="text-[16px] leading-[1.45] text-ink-2">
          {m.countedLine}
          {m.trendLine && ` ${m.trendLine}`}
        </p>
      </section>

      {offPlanOpen && <OffPlanSheet date={m.date} usuals={m.usuals} onClose={() => setOffPlanOpen(false)} />}
      {closing && <CloseOutSheet key={closing.date} day={closing} onClose={() => setClosing(null)} />}
      {telling && <TellSheet onClose={() => setTelling(false)} />}
    </Page>
  );
}

function NextUpPoster({ m }: { m: PlanToday }) {
  const mutate = useMutate();
  const n = m.next;
  if (n.kind === "check-in") {
    return (
      <Poster lines={["Sunday.", "Check-in."]} meta="10 minutes to set up next week">
        <Link to="/check-in" className={`${btn.primary} h-14`}>
          Start check-in
        </Link>
      </Poster>
    );
  }
  if (n.kind === "workout" && m.training) return <WorkoutPoster m={m} t={m.training} />;
  if (n.kind === "meal") {
    const s = m.slots.find((x) => x.slot === n.slot)!;
    return (
      <Poster lines={mealHeadline(s.meal)} meta={`${SLOT_LABEL[s.slot]} · ${s.time} · ${s.meal.kcal} cal`}>
        <ul aria-label="Put on the scale" className="grid grid-cols-2 gap-x-4 gap-y-2 text-[16px]">
          {scaleList(s.meal).map((i) => (
            <li key={i.name} className="flex justify-between gap-2 border-b border-rule pb-1.5">
              <span>{i.name}</span>
              <span className="tabular whitespace-nowrap font-num font-bold">{i.grams} g</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2.5">
          <button type="button" onClick={() => void mutate("logMeal", { clientId: crypto.randomUUID(), date: m.date, slot: s.slot, mealSlug: s.meal.slug })} className={`${btn.primary} h-14 flex-1`}>
            Ate it
          </button>
          <Link to={`/meal/${s.meal.slug}?slot=${s.slot}`} className={`${btn.outline} h-14 px-5 text-[17px] uppercase tracking-[0.02em]`}>
            Swap
          </Link>
        </div>
      </Poster>
    );
  }
  if (n.kind === "steps") {
    return <Poster lines={[`${n.left.toLocaleString()} steps.`, "Two short walks."]} meta={`${m.steps.toLocaleString()} of ${m.targets.stepGoal.toLocaleString()} so far`} />;
  }
  return <Poster lines={["Done.", "Kitchen's closed."]} meta={`${m.totals.proteinG} of ${m.targets.proteinG} g protein today`} />;
}

function WorkoutPoster({ m, t }: { m: PlanToday; t: TrainingModel }) {
  const mutate = useMutate();
  const navigate = useNavigate();
  // Plans the workout if nothing has yet (or retargets it, for Short), then starts it, all on the phone.
  async function begin(templateId: string) {
    const at = new Date().toISOString();
    const key = t.workoutKey ?? crypto.randomUUID();
    if ((!t.workoutKey || templateId !== t.templateId) && !(await mutate("planWorkout", { clientId: key, date: m.date, templateId, at }))) return;
    if (await mutate("startWorkout", { workout: key, at })) navigate("/workout");
  }
  return (
    <Poster lines={t.headline} meta={t.meta}>
      {t.goUp && <ProgressionCallout>{t.goUp}</ProgressionCallout>}
      <div className="flex gap-2.5">
        {t.started ? (
          <Link to="/workout" className={`${btn.primary} h-14 flex-1 px-3`}>
            {t.buttonLabel}
          </Link>
        ) : (
          <button type="button" onClick={() => void begin(t.templateId)} className={`${btn.primary} h-14 flex-1 px-3`}>
            {t.buttonLabel}
          </button>
        )}
        {!t.started && t.templateId !== plan.planB && (
          <button type="button" onClick={() => void begin(plan.planB)} className={`${btn.outline} h-14 flex-col px-3.5 text-[16px] uppercase leading-[1.1] tracking-[0.02em]`}>
            Short
            <span className="text-[13px] font-semibold normal-case tracking-normal text-ink-3">25 min, home</span>
          </button>
        )}
      </div>
    </Poster>
  );
}

function Fuel({ m, eatenAtOpen, onAteElse, onCloseOut }: { m: PlanToday; eatenAtOpen: Set<string>; onAteElse: () => void; onCloseOut: () => void }) {
  const mutate = useMutate();
  const left = m.targets.proteinG - m.totals.proteinG;
  const offPlanProtein = m.offPlan.reduce((a, o) => a + o.proteinG, 0);
  const segments = [
    ...m.slots.filter((s) => !s.skipKey).map((s) => ({ label: SLOT_LABEL[s.slot].toLowerCase(), grams: s.meal.protein, state: s.logKey ? ("eaten" as const) : s.next ? ("next" as const) : ("later" as const) })),
    ...(offPlanProtein > 0 ? [{ label: "off-plan", grams: offPlanProtein, state: "eaten" as const }] : []),
  ];
  return (
    <section aria-labelledby="fuel" className="flex flex-col gap-3.5">
      <SectionHead id="fuel" note={m.modeLabel}>
        Fuel
      </SectionHead>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between font-num">
          <span className="tabular text-[34px] font-bold leading-none">
            {m.totals.proteinG}
            <span className="text-[18px] font-semibold text-ink-3"> of {m.targets.proteinG} g protein</span>
          </span>
          <span className="tabular text-[16px] font-bold">{left > 0 ? `${left} to go` : "Done"}</span>
        </div>
        <ProteinBar segments={segments} target={m.targets.proteinG} />
        <p className="text-[15px] tabular-nums text-ink-3">
          {m.totals.kcal.toLocaleString()} of {m.targets.kcal.toLocaleString()} cal · {m.steps.toLocaleString()} of {m.targets.stepGoal.toLocaleString()} steps
        </p>
      </div>

      <ul className="flex flex-col">
        {m.slots.map((s) => (
          <MealRow key={s.slot} s={s} date={m.date} fresh={s.logKey !== null && !eatenAtOpen.has(s.slot)} />
        ))}
        {m.offPlan.map((o) => (
          <li key={o.key} className="flex min-h-12 items-center gap-3 border-t border-rule">
            <span className="flex-1 text-[16px]">
              {o.name} <span className="whitespace-nowrap text-[14px] tabular-nums text-ink-3">· {o.kcal} cal</span>
            </span>
            <button type="button" aria-label={`Remove ${o.name}`} onClick={() => void mutate("deleteOffPlan", { key: o.key })} className="flex size-11 items-center justify-center text-ink-3">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
        <li className="flex min-h-12 items-center justify-between gap-3 border-y border-rule">
          <span className="text-[15px] text-ink-3">Off-plan dessert</span>
          <span className="font-num text-[15px] font-bold">{m.dessertLine}</span>
        </li>
      </ul>
      {m.closeOut.link && (
        <button type="button" onClick={onCloseOut} className={btn.quiet}>
          Close out today
        </button>
      )}
      <button type="button" onClick={onAteElse} className={`${btn.outlinePlain} h-11 self-start px-4`}>
        + Ate something else
      </button>
    </section>
  );
}

function MealRow({ s, date, fresh }: { s: SlotModel; date: string; fresh: boolean }) {
  const mutate = useMutate();
  const eat = () => void mutate("logMeal", { clientId: crypto.randomUUID(), date, slot: s.slot, mealSlug: s.meal.slug });
  const recipe = `/meal/${s.meal.slug}?slot=${s.slot}`;
  if (s.logKey) {
    return (
      <li className="flex min-h-12 items-center gap-3 border-t border-rule">
        <span className="tabular w-11 font-num text-[15px] font-semibold text-muted">{s.time}</span>
        <Link to={recipe} className="flex-1 text-[16px] text-muted">
          {s.meal.name} <span className="whitespace-nowrap tabular-nums">· {s.meal.protein} g</span>
        </Link>
        <button type="button" aria-label={`Mark ${s.meal.name} not eaten`} onClick={() => void mutate("unlogMeal", { key: s.logKey })} className="flex h-11 items-center gap-1 text-[14px] font-semibold text-ink-3">
          <span className={`text-ink ${fresh ? "check-land" : ""}`}>
            <Icon name="check" size={16} strokeWidth={2.8} />
          </span>
          Eaten
        </button>
      </li>
    );
  }
  if (s.skipKey) {
    return (
      <li className="flex min-h-12 items-center gap-3 border-t border-rule">
        <span className="tabular w-11 font-num text-[15px] font-semibold text-muted">{s.time}</span>
        <Link to={recipe} className="flex-1 text-[16px] text-muted">
          {s.meal.name}
        </Link>
        <button type="button" aria-label={`Mark ${s.meal.name} not skipped`} onClick={() => void mutate("unlogMeal", { key: s.skipKey })} className="flex h-11 items-center text-[14px] font-semibold text-ink-3">
          Skipped
        </button>
      </li>
    );
  }
  if (s.next) {
    return (
      <li className="-mr-3 flex items-center gap-3 border-t-2 border-ink bg-raised py-3 pr-3">
        <span className="tabular flex w-11 flex-col font-num text-[15px] font-bold">
          <span>{s.time}</span>
          <span className="text-[12px] text-red">NEXT</span>
        </span>
        <Link to={recipe} className="flex flex-1 flex-col">
          <span className="text-[17px] font-bold">{s.meal.name}</span>
          <span className="text-[14px] tabular-nums text-ink-3">
            {s.meal.kcal} cal · {s.meal.protein} g protein
          </span>
        </Link>
        <button type="button" onClick={eat} className={`${btn.outline} h-11 px-3.5 text-[16px]`}>
          Ate it
        </button>
      </li>
    );
  }
  return (
    <li className="flex min-h-[60px] items-center gap-3 border-t border-rule">
      <span className="tabular w-11 font-num text-[15px] font-semibold text-muted">{s.time}</span>
      <Link to={recipe} className="flex flex-1 flex-col">
        <span className="text-[16px]">{s.meal.name}</span>
        <span className="text-[14px] tabular-nums text-muted">
          {s.meal.kcal} cal · {s.meal.protein} g
        </span>
      </Link>
      <button type="button" aria-label={`Mark ${s.meal.name} eaten`} onClick={eat} className="size-11 flex-none rounded-full border-[1.5px] border-border" />
    </li>
  );
}

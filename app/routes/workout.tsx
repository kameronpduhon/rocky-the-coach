import { env } from "cloudflare:workers";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, redirect, useRevalidator } from "react-router";
import type { Route } from "./+types/workout";
import { Segmented } from "~/components/Segmented";
import { Sheet } from "~/components/Sheet";
import { BackButton, BarSpacer, Card, FloatingBar, Icon } from "~/components/ui";
import { exercises, plan } from "~/content";
import { getDb } from "~/db/client";
import { optionalTemplateFor, templateFor } from "~/domain/calendar";
import { isISODate, localDate } from "~/domain/dates";
import { send } from "~/lib/offline-queue";
import { serverNow } from "~/server/clock.server";
import { movesBetween } from "~/server/schedule.server";
import { deleteSet, endSession, logSet, resolveTemplate, swapExercise, updateSet, workoutView, type ExerciseView } from "~/server/workouts.server";

export const handle = { hideTabBar: true };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.view.name ?? "Workout"} · Rocky` }];
}

const BACK = { today: "/", plan: "/plan", progress: "/progress" } as const;
const backTo = (from: unknown) => BACK[from as keyof typeof BACK] ?? "/";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const now = serverNow();
  const db = getDb(env.DB);
  const today = localDate(now);
  // A past date opens that day's workout to log it late or fix a set.
  const asked = url.searchParams.get("date");
  const date = isISODate(asked) && asked < today ? asked : today;
  const moves = await movesBetween(db, date, date);
  const templateId =
    url.searchParams.get("plan") === "b" ? plan.planB : url.searchParams.get("template") ?? templateFor(plan, date, moves) ?? optionalTemplateFor(plan, date);
  if (!templateId || !plan.templates[templateId]) throw redirect("/");
  const from = url.searchParams.get("from") ?? (date === today ? "today" : "plan");
  return { view: await workoutView(db, date, templateId), now: now.toISOString(), live: date === today, from, back: backTo(from) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = getDb(env.DB);
  const now = serverNow();
  const today = localDate(now);
  const date = form.get("date") ? String(form.get("date")) : today;
  if (!isISODate(date) || date > today) return { error: "That day hasn't happened yet." };
  const templateId = String(form.get("templateId"));
  const template = plan.templates[templateId];
  if (!template) return { error: "Unknown workout." };
  const position = Number(form.get("position"));
  const validPosition = Number.isInteger(position) && position >= 0 && position < template.exercises.length;
  switch (form.get("intent")) {
    case "log-set": {
      const weight = Number(form.get("weight"));
      const reps = Number(form.get("reps"));
      const setNumber = Number(form.get("setNumber"));
      const exerciseId = String(form.get("exerciseId"));
      const clientId = String(form.get("clientId") ?? "");
      if (!form.get("reps") || !form.get("weight") || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 0 || !exercises.has(exerciseId)) {
        return { error: "Enter weight and reps." };
      }
      if (!validPosition || !Number.isInteger(setNumber) || setNumber < 1 || !clientId) return { error: "That set doesn't fit this workout." };
      await logSet(db, { date, templateId, position, exerciseId, setNumber, weightLb: weight, reps, clientId }, now);
      return { ok: true };
    }
    case "edit-set": {
      const id = Number(form.get("id"));
      const weight = Number(form.get("weight"));
      const reps = Number(form.get("reps"));
      if (!Number.isInteger(id) || !form.get("reps") || !form.get("weight") || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 0) {
        return { error: "Enter weight and reps." };
      }
      await updateSet(db, id, weight, reps);
      return { ok: true };
    }
    case "delete-set": {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id)) return { error: "Unknown set." };
      await deleteSet(db, id);
      return { ok: true };
    }
    case "swap": {
      const to = exercises.get(String(form.get("to")));
      if (!to || !validPosition) return { error: "Unknown exercise." };
      const current = (await resolveTemplate(db, templateId, date))[position]!;
      if (to.group !== current.exercise.group) return { error: "Pick an exercise for the same muscle." };
      await swapExercise(db, date, templateId, position, to.id, form.get("always") === "true");
      return { ok: true };
    }
    case "end": {
      await endSession(db, date, templateId, now);
      return redirect(backTo(form.get("from")));
    }
    default:
      return { error: "Unknown action" };
  }
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const setsText = (sets: { weight: number; reps: number }[]) => sets.map((s) => `${s.weight} × ${s.reps}`).join(" · ");

/**
 * Ticks on the server's clock rather than the phone's: the first render uses the loader's timestamp on both
 * server and client (so hydration matches), then the client keeps the same offset from its own clock.
 */
function useServerClock(serverIso: string) {
  const [now, setNow] = useState(() => Date.parse(serverIso));
  useEffect(() => {
    const skew = Date.parse(serverIso) - Date.now();
    const tick = () => setNow(Date.now() + skew);
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [serverIso]);
  return now;
}

interface PendingSet {
  position: number;
  setNumber: number;
  weight: number;
  reps: number;
}

/** Workout time, in its own component so the 250 ms tick re-renders this pill and not the whole screen. */
function Elapsed({ serverIso, startedAt, endedAt }: { serverIso: string; startedAt: string | null; endedAt: string | null }) {
  const now = useServerClock(serverIso);
  const start = startedAt ? Date.parse(startedAt) : null;
  const end = endedAt ? Date.parse(endedAt) : now;
  return <>{start ? mmss(Math.max(0, Math.floor((end - start) / 1000))) : "0:00"}</>;
}

function RestBar({ serverIso, restUntil, onSkip }: { serverIso: string; restUntil: number | null; onSkip: () => void }) {
  const now = useServerClock(serverIso);
  const restLeft = restUntil ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0;
  if (restLeft <= 0) return null;
  return (
    <FloatingBar spacer={false} className="flex items-center gap-2.5">
      <div role="timer" className="tabular flex h-[54px] flex-1 items-center justify-center gap-2 rounded-full bg-[var(--glass-selected)] text-[17px] font-semibold">
        <span className="font-medium text-label-on-glass">Rest</span>
        {mmss(restLeft)}
      </div>
      <button type="button" onClick={onSkip} className="btn-prominent h-[54px] rounded-full px-[22px] text-[17px] font-semibold">
        Skip rest
      </button>
    </FloatingBar>
  );
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default function Workout({ loaderData }: Route.ComponentProps) {
  const { live } = loaderData;
  const [pending, setPending] = useState<PendingSet[]>([]);
  // Edited or deleted sets by id, shown until the reload lands. Null is a deleted set.
  const [edits, setEdits] = useState<Record<number, { weight: number; reps: number } | null>>({});
  const view = useMemo(() => {
    const v = loaderData.view;
    const exercises = v.exercises.map((e) => ({
      ...e,
      logged: e.logged.flatMap((l) => (l.id in edits ? (edits[l.id] ? [{ ...l, ...edits[l.id] }] : []) : [l])),
    }));
    return { ...v, exercises };
  }, [loaderData.view, edits]);
  const revalidator = useRevalidator();
  // The server clock's offset from this phone's, so a rest timer started here counts down on the same clock.
  const skew = useRef(0);
  useEffect(() => {
    skew.current = Date.parse(loaderData.now) - Date.now();
  }, [loaderData.now]);
  const firstOpen = view.exercises.findIndex((e) => !e.done);
  const [current, setCurrent] = useState(firstOpen === -1 ? view.exercises.length - 1 : firstOpen);
  const [swapOpen, setSwapOpen] = useState(false);
  const [restUntil, setRestUntil] = useState<number | null>(() => {
    const latest = view.exercises.flatMap((e) => e.logged.map((l) => ({ at: Date.parse(l.loggedAt), rest: e.restSeconds }))).sort((a, b) => b.at - a.at)[0];
    return latest && live && !view.endedAt ? latest.at + latest.rest * 1000 : null;
  });
  const ex = view.exercises[current]!;

  useEffect(() => {
    setPending([]);
    setEdits({});
  }, [loaderData.view]);

  const doneByPosition = new Map(view.exercises.map((e) => [e.position, pending.filter((p) => p.position === e.position).length + e.logged.length >= view.sets]));
  const done = view.exercises.filter((e) => doneByPosition.get(e.position) && e.position !== ex.position);
  const upNext = view.exercises.filter((e) => !doneByPosition.get(e.position) && e.position !== ex.position);
  const allDone = view.exercises.every((e) => doneByPosition.get(e.position));

  async function post(fields: Record<string, string>) {
    // The .data endpoint runs only the action. Posting to /workout would also run the loader and render the whole
    // page as HTML, and the revalidate below loads it again anyway.
    const sent = await send("/workout.data", { templateId: view.templateId, date: view.date, ...fields });
    // Offline, the queue keeps the change and PendingSync revalidates once it lands.
    if (sent) revalidator.revalidate();
  }

  function logSetNow(e: ExerciseView, setNumber: number, weight: number, reps: number) {
    setPending((p) => [...p, { position: e.position, setNumber, weight, reps }]);
    if (live) setRestUntil(Date.now() + skew.current + e.restSeconds * 1000);
    if (setNumber >= view.sets) {
      const next = view.exercises.findIndex((x, i) => i > current && !doneByPosition.get(x.position));
      const wrap = view.exercises.findIndex((x) => !doneByPosition.get(x.position) && x.position !== e.position);
      if (next !== -1) setCurrent(next);
      else if (wrap !== -1) setCurrent(wrap);
    }
    void post({ intent: "log-set", position: String(e.position), exerciseId: e.id, setNumber: String(setNumber), weight: String(weight), reps: String(reps), clientId: crypto.randomUUID() });
  }

  function editSet(id: number, change: { weight: number; reps: number } | null) {
    setEdits((all) => ({ ...all, [id]: change }));
    void post(change ? { intent: "edit-set", id: String(id), weight: String(change.weight), reps: String(change.reps) } : { intent: "delete-set", id: String(id) });
  }

  return (
    <div className="relative mx-auto min-h-dvh max-w-[760px] pb-12">
      <div className="relative h-[300px] overflow-hidden bg-fill min-[600px]:h-[420px]">
        {/* The photos are 3:2. Wider than a phone, a full-width cover crop cuts off heads and bars, so the frame
            keeps its own 3:2 box and a blurred copy of it fills the sides. */}
        <img src={ex.images[0]} alt="" aria-hidden="true" className="absolute inset-0 hidden h-full w-full scale-110 object-cover blur-2xl brightness-[0.6] min-[600px]:block" />
        <div className="absolute inset-y-0 left-1/2 w-full -translate-x-1/2 min-[600px]:aspect-[3/2] min-[600px]:w-auto min-[600px]:max-w-full">
          <img key={`${ex.id}-0`} src={ex.images[0]} alt={`${ex.name}, start and end position`} className="absolute inset-0 h-full w-full object-cover" />
          <img key={`${ex.id}-1`} src={ex.images[1]} alt="" className="frame-b absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="absolute left-4 top-[max(54px,env(safe-area-inset-top))]">
          <BackButton to={loaderData.back} label={loaderData.back === "/" ? "Back to Today" : "Back"} onImage size={46} />
        </div>
        <div role={live ? "timer" : undefined} className="glass-on-image tabular absolute right-4 top-[max(54px,env(safe-area-inset-top))] flex h-[46px] items-center rounded-full px-4 text-[16px] font-semibold">
          {live ? (
            <>
              <span className="sr-only">Workout time </span>
              <Elapsed serverIso={loaderData.now} startedAt={view.startedAt} endedAt={view.endedAt} />
            </>
          ) : (
            DAY_FMT.format(new Date(`${view.date}T12:00:00Z`))
          )}
        </div>
        <button type="button" onClick={() => setSwapOpen(true)} className="glass-on-image absolute bottom-4 right-4 flex h-[46px] items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold">
          <Icon name="swap" size={16} />
          Swap
        </button>
      </div>

      <main className="flex flex-col gap-[18px] px-4 pt-5">
        <header className="px-1">
          <div className="text-[15px] font-semibold text-label-2">
            {view.name} · {current + 1} of {view.exercises.length}
          </div>
          <h1 className="mt-0.5 text-[30px] font-bold leading-tight">{ex.name}</h1>
          <div className="mt-0.5 text-[15px] text-label-2">
            {ex.repMin} to {ex.repMax} reps · {view.sets} set{view.sets === 1 ? "" : "s"} to failure{view.deload ? " · deload week" : ""}
          </div>
          <div
            role="progressbar"
            aria-label="Exercises done"
            aria-valuemin={0}
            aria-valuemax={view.exercises.length}
            aria-valuenow={view.exercises.filter((e) => doneByPosition.get(e.position)).length}
            className="mt-3.5 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${view.exercises.length}, minmax(0, 1fr))` }}
          >
            {view.exercises.map((e, i) => (
              <div
                key={e.position}
                className="h-1 rounded-full"
                style={{ background: doneByPosition.get(e.position) ? "var(--steps)" : i === current ? "var(--label)" : "var(--fill)" }}
              />
            ))}
          </div>
        </header>

        <SetCard key={ex.id} ex={ex} sets={view.sets} pending={pending.filter((p) => p.position === ex.position)} onLog={(n, w, r) => logSetNow(ex, n, w, r)} onEdit={editSet} />

        {done.length > 0 && (
          <Card className="overflow-hidden" aria-label="Done">
            {done.map((e) => {
              const sets = [...e.logged, ...pending.filter((p) => p.position === e.position)];
              return (
                <button
                  key={e.position}
                  type="button"
                  onClick={() => setCurrent(view.exercises.indexOf(e))}
                  className="flex w-full items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 text-left last:border-b-0"
                >
                  <img src={e.images[0]} alt="" className="size-14 flex-none rounded-[14px] bg-fill object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-label-2">{e.name} · done</div>
                    <div className="tabular mt-0.5 text-[14px] font-semibold text-steps-text">
                      {setsText(sets)}
                      {e.nextTime !== null && (
                        <>
                          . <span className="whitespace-nowrap">Next time {e.nextTime} lb</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </Card>
        )}

        {upNext.length > 0 && (
          <section aria-label="Up next" className="flex flex-col gap-2">
            <h2 className="px-1 pt-1.5 text-[22px] font-bold">Up next</h2>
            <Card className="overflow-hidden">
              {upNext.map((e) => (
                <button
                  key={e.position}
                  type="button"
                  onClick={() => setCurrent(view.exercises.indexOf(e))}
                  className="flex w-full items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 text-left last:border-b-0"
                >
                  <img src={e.images[0]} alt="" className="size-14 flex-none rounded-[14px] bg-fill object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold">{e.name}</div>
                    {e.suggestion.goUp ? (
                      <div className="tabular mt-px text-[14px] font-semibold text-steps-text">Go up to {e.suggestion.weight} lb today</div>
                    ) : (
                      <div className="tabular mt-px text-[14px] text-label-2">{e.last ? `Last ${setsText(e.last)}` : "First time"}</div>
                    )}
                  </div>
                  <span className="flex-none text-label-4">
                    <Icon name="chevron" size={18} strokeWidth={2.4} />
                  </span>
                </button>
              ))}
            </Card>
          </section>
        )}

        <Form method="post" action={`/workout?template=${view.templateId}`}>
          <input type="hidden" name="intent" value="end" />
          <input type="hidden" name="templateId" value={view.templateId} />
          <input type="hidden" name="date" value={view.date} />
          <input type="hidden" name="from" value={loaderData.from} />
          <button type="submit" className="btn-secondary h-[52px] w-full rounded-full text-[16px] font-semibold">
            {!live ? "Done" : allDone ? "Finish workout" : "End workout"}
          </button>
        </Form>
      </main>

      {/* Always reserved so the page does not jump when the rest bar comes and goes. */}
      <BarSpacer />
      {live && <RestBar serverIso={loaderData.now} restUntil={restUntil} onSkip={() => setRestUntil(null)} />}

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title="Swap exercise">
        <SwapList
          name={ex.name}
          day={view.name}
          options={ex.swapOptions}
          onPick={(id, always) => {
            setSwapOpen(false);
            void post({ intent: "swap", position: String(ex.position), to: id, always: String(always) });
          }}
        />
      </Sheet>
    </div>
  );
}

const validSet = (weight: string, reps: string) => {
  const w = Number(weight);
  const n = Number(reps);
  return weight.trim() !== "" && reps.trim() !== "" && Number.isFinite(w) && w >= 0 && Number.isInteger(n) && n >= 0 ? { weight: w, reps: n } : null;
};

function SetCard({
  ex,
  sets,
  pending,
  onLog,
  onEdit,
}: {
  ex: ExerciseView;
  sets: number;
  pending: Omit<PendingSet, "position">[];
  onLog: (setNumber: number, weight: number, reps: number) => void;
  onEdit: (id: number, change: { weight: number; reps: number } | null) => void;
}) {
  const rows = useMemo(() => {
    const done = new Map<number, { weight: number; reps: number; id?: number }>();
    for (const l of ex.logged) done.set(l.setNumber, l);
    for (const p of pending) done.set(p.setNumber, p);
    return Array.from({ length: sets }, (_, i) => ({ setNumber: i + 1, done: done.get(i + 1) ?? null }));
  }, [ex.logged, pending, sets]);
  const nextSet = rows.find((r) => !r.done)?.setNumber ?? null;
  // Later sets start from the weight just used today; the first starts from the progression suggestion.
  const todayWeight = [...rows].reverse().find((r) => r.done)?.done?.weight;
  const bodyWeight = ex.equipment === "body-weight";
  const [weight, setWeight] = useState(String(todayWeight ?? ex.suggestion.weight ?? (bodyWeight ? 0 : "")));
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; weight: string; reps: string } | null>(null);

  return (
    <Card className="flex flex-col gap-3.5 p-[18px]" aria-label="Sets">
      <div className="tabular rounded-[14px] bg-fill px-3.5 py-3 text-[15px] leading-snug text-label-on-fill">
        {ex.last ? (
          <>
            Last time <strong className="font-semibold text-label">{setsText(ex.last)}</strong>.{" "}
            {ex.suggestion.goUp ? <span className="font-semibold text-steps-text">Go up to {ex.suggestion.weight} lb.</span> : "Beat it."}
          </>
        ) : (
          bodyWeight ? "First time on this one. Body weight counts as 0 lb; add any weight you hold or wear." : "First time on this one. Pick a weight you can do for the bottom of the range."
        )}
      </div>
      <div aria-hidden="true" className="grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_50px] items-center gap-2.5 text-[13px] font-semibold text-label-3">
        <span>SET</span>
        <span>LB</span>
        <span>REPS</span>
        <span />
      </div>
      {rows.map((r) =>
        r.done && editing && r.done.id === editing.id ? (
          <div key={r.setNumber} className="flex flex-col gap-2">
            <form
              className="tabular grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_50px] items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                const set = validSet(editing.weight, editing.reps);
                if (!set) {
                  setError("Enter weight and reps.");
                  return;
                }
                setError(null);
                setEditing(null);
                // The next set's weight came from this one, so it follows the fix.
                if (weight === String(r.done!.weight)) setWeight(String(set.weight));
                onEdit(editing.id, set);
              }}
            >
              <span className="text-[17px] font-bold">{r.setNumber}</span>
              <label className="flex">
                <span className="sr-only">Set {r.setNumber} weight in pounds</span>
                <input
                  value={editing.weight}
                  onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoFocus
                  className="tabular h-[50px] w-full rounded-[14px] border-2 border-label bg-fill px-3 text-[19px] font-semibold text-label outline-none"
                />
              </label>
              <label className="flex">
                <span className="sr-only">Set {r.setNumber} reps</span>
                <input
                  value={editing.reps}
                  onChange={(e) => setEditing({ ...editing, reps: e.target.value })}
                  inputMode="numeric"
                  enterKeyHint="done"
                  className="tabular h-[50px] w-full rounded-[14px] bg-fill px-3.5 text-[19px] font-semibold text-label outline-none focus:ring-2 focus:ring-label"
                />
              </label>
              <button type="submit" aria-label={`Save set ${r.setNumber}`} className="btn-prominent flex size-[50px] items-center justify-center rounded-full">
                <Icon name="check" strokeWidth={3} />
              </button>
            </form>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => (setEditing(null), setError(null))} className="btn-secondary h-11 rounded-full px-4 text-[15px] font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setError(null);
                  onEdit(editing.id, null);
                }}
                className="btn-secondary h-11 rounded-full px-4 text-[15px] font-semibold text-calories"
              >
                Delete set
              </button>
            </div>
          </div>
        ) : r.done ? (
          <button
            key={r.setNumber}
            type="button"
            disabled={r.done.id === undefined}
            onClick={() => r.done?.id !== undefined && setEditing({ id: r.done.id, weight: String(r.done.weight), reps: String(r.done.reps) })}
            aria-label={`Set ${r.setNumber}, ${r.done.weight} pounds, ${r.done.reps} reps. Edit`}
            className="tabular grid w-full grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_50px] items-center gap-2.5 text-left"
          >
            <span className="text-[17px] font-bold text-label-2">{r.setNumber}</span>
            <span className="flex h-[50px] items-center rounded-[14px] bg-fill px-3.5 text-[19px] font-semibold">{r.done.weight}</span>
            <span className="flex h-[50px] items-center rounded-[14px] bg-fill px-3.5 text-[19px] font-semibold">{r.done.reps}</span>
            <span className="flex size-[50px] items-center justify-center rounded-full bg-steps text-black">
              <Icon name="check" strokeWidth={3.2} />
            </span>
          </button>
        ) : r.setNumber === nextSet ? (
          <form
            key={r.setNumber}
            className="tabular grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_50px] items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const set = validSet(weight, reps);
              if (!set) {
                setError("Enter weight and reps.");
                return;
              }
              setError(null);
              onLog(r.setNumber, set.weight, set.reps);
              setReps("");
            }}
          >
            <span className="text-[17px] font-bold">{r.setNumber}</span>
            <label className="flex">
              <span className="sr-only">Set {r.setNumber} weight in pounds</span>
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal"
                enterKeyHint="next"
                className="tabular h-[50px] w-full rounded-[14px] border-2 border-label bg-fill px-3 text-[19px] font-semibold text-label outline-none"
              />
            </label>
            <label className="flex">
              <span className="sr-only">Set {r.setNumber} reps</span>
              <input
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="reps"
                className="tabular h-[50px] w-full rounded-[14px] bg-fill px-3.5 text-[19px] font-semibold text-label outline-none placeholder:text-label-on-fill focus:ring-2 focus:ring-label"
              />
            </label>
            <button type="submit" aria-label={`Log set ${r.setNumber}`} className="btn-secondary flex size-[50px] items-center justify-center rounded-full">
              <Icon name="check" strokeWidth={3} />
            </button>
          </form>
        ) : (
          <div key={r.setNumber} className="grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_50px] items-center gap-2.5">
            <span className="text-[17px] font-bold text-label-2">
              <span className="sr-only">Set </span>
              {r.setNumber}
            </span>
            <div className="tabular flex h-[50px] items-center rounded-[14px] bg-fill px-3.5 text-[19px] font-semibold">
              {weight}
              <span className="sr-only"> pounds planned</span>
            </div>
            <div className="flex h-[50px] items-center rounded-[14px] bg-fill px-3.5 text-[19px] font-semibold text-label-on-fill">reps</div>
            <button type="button" disabled aria-label={`Log set ${r.setNumber}, after set ${r.setNumber - 1}`} className="btn-secondary flex size-[50px] items-center justify-center rounded-full text-label-on-fill">
              <Icon name="check" strokeWidth={3} />
            </button>
          </div>
        ),
      )}
      {ex.logged.length > 0 && !editing && <p className="text-[13px] text-label-2">Tap a logged set to fix its weight or reps.</p>}
      {error && (
        <p role="alert" className="text-[14px] font-semibold text-calories">
          {error}
        </p>
      )}
    </Card>
  );
}

const EQUIPMENT: Record<string, string> = { machine: "Machine", cable: "Cable", dumbbell: "Dumbbell", barbell: "Barbell", "body-weight": "Body weight" };

function SwapList({ name, day, options, onPick }: { name: string; day: string; options: ExerciseView["swapOptions"]; onPick: (id: string, always: boolean) => void }) {
  const [always, setAlways] = useState(false);
  return (
    <>
      <Segmented
        label="Swap for"
        options={[
          { value: "today", label: "Just today" },
          { value: "always", label: "Always" },
        ]}
        value={always ? "always" : "today"}
        onChange={(v) => setAlways(v === "always")}
      />
      <p className="mt-2 px-1 text-[13px] text-label-2">
        {always ? `Replaces ${name.toLowerCase()} in every ${day} workout from now on.` : `Only today's workout changes. ${name} comes back next time.`}
      </p>
      <div className="mt-3 overflow-hidden rounded-[26px] bg-card">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onPick(o.id, always)} className="flex w-full items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 text-left last:border-b-0">
            <img src={o.image} alt="" className="size-14 flex-none rounded-[14px] bg-fill object-cover" />
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold">{o.name}</div>
              <div className="mt-px text-[14px] text-label-2">{EQUIPMENT[o.equipment] ?? o.equipment}</div>
            </div>
            <span className="flex-none text-label-4">
              <Icon name="chevron" size={18} strokeWidth={2.4} />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

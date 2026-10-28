import { useEffect, useState } from "react";
import { COACH_NAME } from "~/brand";
import { Icon } from "~/components/ui";
import { plan } from "~/content";
import { btn } from "~/ui/button";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { ProgressionCallout } from "~/ui/ProgressionCallout";
import { RestPanel } from "~/ui/RestPanel";
import { SegmentRow } from "~/ui/SegmentRow";
import { Stepper } from "~/ui/Stepper";
import { AddLiftSheet } from "./AddLiftSheet";
import { LiftListSheet } from "./LiftListSheet";
import { addLifts, dropLift, swapToday } from "./lifts";
import { lastLine, nextOpen, nextTarget, restAfter, restLeft, standingLine, type LiftView, type RestState, type WorkoutModel } from "./model";
import { NoteSheet } from "./NoteSheet";
import { cancelPing, notificationsOn, pingBody, schedulePing } from "./ping";
import { SetsSheet } from "./SetsSheet";
import { SwapSheet } from "./SwapSheet";
import { useWorkoutActions } from "./use-actions";

type Ping = "on" | "off" | "failed";
const PING_LINE: Record<Ping, string> = {
  on: `Lock your phone. ${COACH_NAME} pings you at 0:00.`,
  off: "Turn on notifications in Settings to get a ping.",
  failed: "No signal, so no ping. Keep an eye on the clock.",
};

type SheetName = "list" | "swap" | "add" | "note" | "sets";

/** Time since Start, in its own component so the 1 s tick redraws the header and not the screen. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return <>{h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`}</>;
}

/** Set and Rest (mocks WorkoutSet, WorkoutRest). */
export function SetScreen({ m, back }: { m: WorkoutModel; back: string }) {
  const act = useWorkoutActions(m);
  // The lift jumped to from the list, while it is unfinished. Otherwise the first unfinished one.
  const [picked, setPicked] = useState<number | null>(null);
  const [rest, setRest] = useState<RestState | null>(() => restLeft(m, Date.now()));
  const [ping, setPing] = useState<Ping>("on");
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [entry, setEntry] = useState<{ key: string; weight: number | null; reps: number | null }>({ key: "", weight: null, reps: null });
  useEffect(() => {
    void notificationsOn().then((on) => !on && setPing("off"));
  }, []);

  const lift = rest ? (m.lifts.find((l) => l.position === rest.position) ?? null) : (m.lifts.find((l) => l.position === picked && !l.done) ?? m.current);
  const target = lift && !rest ? nextTarget(lift, m.setsPerLift) : null;
  // The weight and reps on the cards start from the target and reset when the target moves on.
  const targetKey = lift && target ? `${lift.position}-${target.setNumber}` : "";
  const values = entry.key === targetKey ? entry : { key: targetKey, weight: target?.weight ?? null, reps: target?.reps ?? null };

  function schedule(seconds: number, next: RestState["next"]) {
    if (ping === "off") return;
    void schedulePing(seconds, pingBody(next.name, next.setNumber)).then((ok) => setPing((p) => (p === "off" ? p : ok ? "on" : "failed")));
  }

  async function log(l: LiftView, setNumber: number, weight: number, reps: number) {
    if (!(await act.logSet(l, setNumber, weight, reps))) return;
    const after = restAfter(m.lifts, m.setsPerLift, l.position, setNumber, Date.now());
    setRest(after);
    if (after) schedule(after.total, after.next);
    // The last set of the workout has no rest, so any ping still waiting goes.
    else void cancelPing();
  }

  function endRest() {
    if (rest) setPicked(rest.next.position);
    setRest(null);
  }

  function skip() {
    void cancelPing();
    endRest();
  }

  function adjust(delta: number) {
    if (!rest) return;
    const endsAt = rest.endsAt + delta * 1000;
    const left = (endsAt - Date.now()) / 1000;
    if (left <= 0) return skip();
    setRest({ ...rest, endsAt, total: Math.max(rest.total, Math.ceil(left)) });
    schedule(left, rest.next);
  }

  async function check(l: LiftView) {
    if (await act.check(l, true)) setPicked(nextOpen(m.lifts, l.position)?.position ?? null);
  }

  async function finish() {
    setSheet(null);
    void cancelPing();
    await act.finish();
  }

  const index = lift ? m.lifts.indexOf(lift) : m.lifts.length - 1;
  const header = (
    <>
      <HeaderIcon to={back} label="Back to Today. The workout keeps running" icon="close" />
      <button type="button" onClick={() => setSheet("list")} className="tabular h-11 whitespace-nowrap font-num text-[17px] font-bold tracking-[0.04em]">
        LIFT {index + 1} OF {m.lifts.length} · <Elapsed since={m.startedAt!} />
      </button>
      <button type="button" disabled={!lift} onClick={() => setSheet("swap")} className="flex h-11 items-center gap-1.5 rounded-[6px] border-[1.5px] border-border px-3.5 font-num text-[16px] font-bold disabled:opacity-60">
        <Icon name="swap" size={16} />
        Swap
      </button>
    </>
  );
  const segments = m.lifts.map((l) => (l === lift ? ("current" as const) : l.done ? ("done" as const) : ("todo" as const)));

  let body: React.ReactNode;
  let dock: React.ReactNode;
  if (!lift) {
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-[64px] uppercase leading-[0.92]">
            <span className="block">Every lift.</span>
            <span className="block">Done.</span>
          </h1>
          <p className="font-num text-[18px] font-semibold text-ink-3">Finish to see what moves up next week.</p>
        </section>
        <button type="button" onClick={() => setSheet("list")} className={btn.quiet}>
          See or fix the lifts
        </button>
      </>
    );
    dock = (
      <Dock>
        <button type="button" onClick={() => void finish()} className={`${btn.gym} h-16`}>
          Finish workout
        </button>
      </Dock>
    );
  } else if (rest) {
    const nextLift = m.lifts.find((l) => l.position === rest.next.position);
    const same = rest.next.position === lift.position;
    const nextUp = nextLift ? nextTarget(nextLift, m.setsPerLift) : null;
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-[64px] uppercase leading-[0.92] [overflow-wrap:anywhere]">{lift.name}.</h1>
          <p className="font-num text-[18px] font-semibold text-ink-3">
            {same ? `Set ${rest.next.setNumber} of ${m.setsPerLift} next` : `Next: ${rest.next.name}`} · {lift.repMin} to {lift.repMax} reps · to failure
          </p>
        </section>
        <ol aria-label="Sets" className="flex flex-col">
          {lift.sets.map((x, i) => (
            <li key={x.key} className={i === 0 ? "border-t-2 border-ink" : "border-t border-rule"}>
              <button type="button" onClick={() => setSheet("sets")} aria-label={`Set ${x.setNumber}, ${x.weight} pounds, ${x.reps} reps. Fix it`} className="flex min-h-14 w-full items-center gap-3 text-left">
                <span className="w-[54px] font-num text-[15px] font-bold text-ink-3">SET {x.setNumber}</span>
                <span className="tabular flex-1 font-num text-[26px] font-bold">
                  {x.weight} × {x.reps}
                </span>
                <span className="flex items-center gap-1 text-[14px] font-semibold text-ink-3">
                  <Icon name="check" size={16} strokeWidth={2.8} />
                  Logged
                </span>
              </button>
            </li>
          ))}
          {nextUp && (
            <li className="flex min-h-14 items-center gap-3 border-y border-rule">
              <span className="w-[54px] font-num text-[15px] font-bold text-ink-3">{same ? `SET ${nextUp.setNumber}` : "NEXT"}</span>
              <span className={`tabular flex-1 font-num font-bold text-muted ${same ? "text-[26px]" : "text-[18px]"}`}>
                {same ? `${nextUp.weight ?? ""} × ${nextUp.reps}` : `${rest.next.name}${nextUp.weight !== null ? `, ${nextUp.weight} × ${nextUp.reps}` : ""}`}
              </span>
              <span className="text-[14px] text-ink-3">target</span>
            </li>
          )}
        </ol>
        <p className="text-[16px] leading-[1.45] text-ink-2">{standingLine(lift, m.setsPerLift)}</p>
      </>
    );
    dock = <RestPanel endsAt={rest.endsAt} total={rest.total} line={PING_LINE[ping]} onAdjust={adjust} onSkip={skip} onDone={endRest} />;
  } else {
    const t = target!;
    const line = lastLine(lift, m.date);
    const after = nextOpen(m.lifts, lift.position);
    const ready = values.weight !== null && values.reps !== null;
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-[64px] uppercase leading-[0.92] [overflow-wrap:anywhere]">{lift.name}.</h1>
          <p className="font-num text-[18px] font-semibold text-ink-3">
            Set {t.setNumber} of {m.setsPerLift} · {lift.repMin} to {lift.repMax} reps · to failure
          </p>
        </section>
        {line.goUp ? <ProgressionCallout>{line.text}</ProgressionCallout> : <p className="text-[16px] leading-[1.4] text-ink-2">{line.text}</p>}
        <button type="button" onClick={() => setSheet("note")} className="flex min-h-11 items-start gap-2 text-left text-[15px] leading-[1.4] text-ink-3">
          <span className="mt-0.5 flex-none">
            <Icon name="pin" size={16} strokeWidth={2} />
          </span>
          {lift.note ? <span>Your note: {lift.note}</span> : <span className="underline decoration-underline underline-offset-4">Add a note</span>}
        </button>
        <section aria-label={`Set ${t.setNumber}`} className="mt-1 grid grid-cols-2 gap-3">
          <Stepper
            label="Weight, lb"
            value={values.weight}
            step={lift.increment}
            decimal
            less={`${lift.increment} pounds less`}
            more={`${lift.increment} pounds more`}
            onChange={(weight) => setEntry({ ...values, weight })}
          />
          <Stepper label="Reps" value={values.reps} step={1} less="One rep fewer" more="One rep more" onChange={(reps) => setEntry({ ...values, reps })} />
        </section>
        {lift.sets.length === 0 && (
          <button type="button" onClick={() => void check(lift)} className={btn.quiet}>
            Done, no numbers
          </button>
        )}
      </>
    );
    dock = (
      <Dock>
        <div className="flex justify-between gap-3 text-[15px] text-ink-3">
          <span className="whitespace-nowrap">{t.setNumber < m.setsPerLift ? `Then set ${t.setNumber + 1}${values.weight !== null ? ` at ${values.weight}` : ""}` : "Last set"}</span>
          <span className="min-w-0 truncate text-right">{after ? `Next lift: ${after.name}` : "Last lift"}</span>
        </div>
        <button type="button" disabled={!ready} onClick={() => ready && void log(lift, t.setNumber, values.weight!, values.reps!)} className={`${btn.gym} h-16 disabled:opacity-60`}>
          Log set {t.setNumber}
          {ready ? `: ${values.weight} × ${values.reps}` : ""}
        </button>
      </Dock>
    );
  }

  return (
    <GymFrame header={header} dock={dock}>
      <SegmentRow segments={segments} />
      {body}

      <LiftListSheet
        m={m}
        open={sheet === "list"}
        onJump={(position) => {
          setSheet(null);
          setRest(null);
          setPicked(position);
        }}
        onUncheck={(l) => void act.check(l, false)}
        onAdd={() => setSheet("add")}
        onFinish={() => void finish()}
        onClose={() => setSheet(null)}
      />
      <AddLiftSheet open={sheet === "add"} lifts={m.lifts} onAdd={(ids) => void act.editLifts((list) => addLifts(list, ids))} onClose={() => setSheet(null)} />
      <SwapSheet
        key={`swap-${lift?.position}`}
        lift={sheet === "swap" ? lift : null}
        list={m.lifts}
        canAlways={lift !== null && lift.from !== "added" && m.templateId !== null && m.templateId in plan.templates}
        onToday={(id) => {
          setSheet(null);
          void act.editLifts((list) => swapToday(list, lift!.position, id));
        }}
        onAlways={(id) => {
          setSheet(null);
          void act.swapAlways(lift!, id);
        }}
        onSkip={() => {
          setSheet(null);
          setPicked(null);
          void act.editLifts((list) => dropLift(list, lift!.position));
        }}
        onClose={() => setSheet(null)}
      />
      <NoteSheet
        key={`note-${lift?.position}`}
        lift={sheet === "note" ? lift : null}
        onSave={(note) => {
          setSheet(null);
          if (lift) void act.note(lift.exercise, note);
        }}
        onClose={() => setSheet(null)}
      />
      <SetsSheet
        key={`sets-${lift?.position}`}
        lift={sheet === "sets" ? lift : null}
        setsPerLift={m.setsPerLift}
        canAdd={false}
        onEdit={(key, w, r) => void act.editSet(key, w, r)}
        onDelete={(key) => void act.deleteSet(key)}
        onAdd={() => undefined}
        onClose={() => setSheet(null)}
      />
    </GymFrame>
  );
}

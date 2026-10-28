import { describe, expect, it } from "vitest";
import { checkProposals, proposalCards, refreshCards, resultLine, runAccept, sendButton, tellContext, TELL_FAILED, type Proposal, type RawProposal } from "~/ai/proposals";
import { COACH_NAME } from "~/brand";
import { plan } from "~/content";
import { runMutation } from "~/sync/mutators";
import type { Row } from "~/sync/tables";
import { MemoryTx } from "~/sync/tx";
import type { Lift } from "~/workout/lifts";

const LEGS = "wed-legs-shoulders";
const PRESS = "seated-dumbbell-shoulder-press";
const RAISE = "seated-lateral-raise";
const NOTE = "My left shoulder is sore, no overhead pressing this week";

const raw = (p: Partial<RawProposal>): RawProposal => ({ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: null, ...p });
const SWAP: Proposal = { kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" };
const MOVE: Proposal = { kind: "move", from: "2026-10-28", to: "2026-10-29" };
const FACT: Proposal = { kind: "fact", text: "Left shoulder sore" };
const TODAY = "2026-10-27";
const rowsOf =
  (t: Record<string, Row[]> = {}) =>
  (name: string): Row[] =>
    t[name] ?? [];
const swap = (scope: "week" | "always"): Proposal => ({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope });
const TITLE = "Swap Seated dumbbell shoulder press for Seated lateral raise";
const OVERRIDE = { exercise_overrides: [{ template_id: LEGS, position: 4, exercise_id: "machine-shoulder-press" }] };

describe("checkProposals (the Worker, against the content)", () => {
  it("keeps proposals naming a plan template, library exercises and real dates, trimming a fact", () => {
    expect(
      checkProposals(
        [
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-10-29" }),
          raw({ kind: "fact", text: "  Left shoulder sore  " }),
        ],
        NOTE,
        true,
      ),
    ).toEqual([SWAP, MOVE, FACT]);
  });

  it("drops a non-library exercise, an unknown template, a same-exercise swap, a swap with no scope, and a bad move", () => {
    expect(
      checkProposals(
        [
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "landmine-press", scope: "week" }),
          raw({ kind: "swap", templateId: "sat-arms", replaces: PRESS, exercise: RAISE, scope: "always" }),
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: PRESS, scope: "always" }),
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: null }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-02-30" }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-10-28" }),
        ],
        NOTE,
        true,
      ),
    ).toEqual([]);
  });

  it("drops a fact with a number the person didn't type, or past 200 characters, and keeps one with a typed number", () => {
    expect(checkProposals([raw({ text: "Keep walks under 30 minutes" })], NOTE, true)).toEqual([]);
    expect(checkProposals([raw({ text: "x".repeat(201) })], NOTE, true)).toEqual([]);
    expect(checkProposals([raw({ text: "Feet hurt after 45 minutes" })], "My feet hurt after 45 minutes of walking", true)).toEqual([{ kind: "fact", text: "Feet hurt after 45 minutes" }]);
  });

  it("keeps at most three, and only facts for someone with no plan", () => {
    const facts = ["Sore shoulder", "Bad knee", "Short on sleep", "Travelling Thursday"].map((text) => raw({ text }));
    expect(checkProposals(facts, NOTE, true)).toHaveLength(3);
    expect(
      checkProposals([raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" }), raw({ kind: "move", from: "2026-10-28", to: "2026-10-29" }), raw({ text: "Left shoulder sore" })], NOTE, false),
    ).toEqual([FACT]);
  });
});

describe("tellContext (what the phone sends)", () => {
  it("lists today and the next 7 days, and each workout's lifts as the plan has them now", () => {
    const ctx = tellContext(rowsOf(OVERRIDE), TODAY, true);
    expect(ctx.days.map((d) => [d.date, d.weekday, d.workout, d.templateId, d.logged])).toEqual([
      ["2026-10-27", "Tuesday", "rest", null, false],
      ["2026-10-28", "Wednesday", "Legs, Shoulders", LEGS, false],
      ["2026-10-29", "Thursday", "rest", null, false],
      ["2026-10-30", "Friday", "Chest, Shoulders, Arms", "fri-chest-shoulders-arms", false],
      ["2026-10-31", "Saturday", "rest", null, false],
      ["2026-11-01", "Sunday", "rest", null, false],
      ["2026-11-02", "Monday", "Chest, Back, Arms", "mon-chest-back-arms", false],
      ["2026-11-03", "Tuesday", "rest", null, false],
    ]);
    expect(Object.keys(ctx.templates)).toEqual([LEGS, "fri-chest-shoulders-arms", "mon-chest-back-arms"]);
    expect(ctx.templates[LEGS]).toEqual(["leg-press", "dumbbell-romanian-deadlift", "lying-leg-curl", "leg-extension", "machine-shoulder-press", "cable-lateral-raise"]);
  });

  it("sends nothing about workouts for someone with no plan", () => {
    expect(tellContext(rowsOf(), TODAY, false)).toEqual({ days: [], templates: {} });
  });
});

describe("proposalCards (the phone, against its copy)", () => {
  it("a this-week swap names the days it changes and leaves next week alone", () => {
    const [card] = proposalCards(rowsOf(), [swap("week")], TODAY, true);
    expect(card).toMatchObject({ id: "p0", scope: "This week only", title: TITLE, sub: "Legs, Shoulders on Wednesday, Oct 28. Next week goes back to normal.", done: "Swapped." });
    expect(card.accept).toMatchObject({ kind: "swapWeek", exercise: RAISE, days: [{ date: "2026-10-28", templateId: LEGS, workout: null, position: 4 }] });
  });

  it("a this-week swap uses a workout already planned for the day", () => {
    const planned = { workout_sessions: [{ client_id: "w-28", date: "2026-10-28", template_id: LEGS, started_at: null, ended_at: null, lifts: null, planned_at: "2026-10-27T15:00:00.000Z" }] };
    const [card] = proposalCards(rowsOf(planned), [swap("week")], TODAY, true);
    expect(card.accept).toMatchObject({ kind: "swapWeek", days: [{ date: "2026-10-28", workout: "w-28", position: 4 }] });
  });

  it("a from-now-on swap runs swapAlways at the lift's place in the template", () => {
    expect(proposalCards(rowsOf(), [swap("always")], TODAY, true)).toEqual([
      {
        id: "p0",
        proposal: swap("always"),
        fits: true,
        scope: "From now on",
        title: TITLE,
        sub: "Legs, Shoulders, from Wednesday, Oct 28 on. Swap back from the workout any time.",
        done: "Swapped.",
        accept: { kind: "swapAlways", templateId: LEGS, position: 4, exercise: RAISE },
      },
    ]);
  });

  it("drops a swap whose lift isn't in the workout any more", () => {
    expect(proposalCards(rowsOf(OVERRIDE), [swap("week"), swap("always")], TODAY, true)).toEqual([]);
  });

  it("a move names both days, and the workout that trades places", () => {
    expect(proposalCards(rowsOf(), [{ kind: "move", from: "2026-10-28", to: "2026-10-29" }, { kind: "move", from: "2026-10-28", to: "2026-10-30" }], TODAY, true)).toEqual([
      {
        id: "p0",
        proposal: { kind: "move", from: "2026-10-28", to: "2026-10-29" },
        fits: true,
        scope: null,
        title: "Move Wednesday's Legs, Shoulders to Thursday",
        sub: "Oct 28 to Oct 29.",
        done: "Moved.",
        accept: { kind: "move", a: "2026-10-28", b: "2026-10-29", carry: [] },
      },
      {
        id: "p1",
        proposal: { kind: "move", from: "2026-10-28", to: "2026-10-30" },
        fits: true,
        scope: null,
        title: "Move Wednesday's Legs, Shoulders to Friday",
        sub: "Oct 28 to Oct 30. Friday's Chest, Shoulders, Arms moves to Wednesday.",
        done: "Moved.",
        accept: { kind: "move", a: "2026-10-28", b: "2026-10-30", carry: [] },
      },
    ]);
  });

  it("drops a move across weeks, from the past, from a rest day, or touching a logged day", () => {
    const logged = { workout_sessions: [{ client_id: "w-28", date: "2026-10-28", template_id: LEGS, started_at: "2026-10-27T17:00:00.000Z", ended_at: "2026-10-27T18:00:00.000Z", lifts: null }] };
    const moves: Proposal[] = [
      { kind: "move", from: "2026-10-30", to: "2026-11-02" },
      { kind: "move", from: "2026-10-26", to: "2026-10-29" },
      { kind: "move", from: "2026-10-29", to: "2026-10-31" },
    ];
    expect(proposalCards(rowsOf(), moves, TODAY, true)).toEqual([]);
    expect(proposalCards(rowsOf(logged), [{ kind: "move", from: "2026-10-28", to: "2026-10-29" }], TODAY, true)).toEqual([]);
  });

  it("a fact is dated today, and dropped when What Rocky knows is full", () => {
    expect(proposalCards(rowsOf(), [FACT], TODAY, true)).toEqual([
      {
        id: "p0",
        proposal: FACT,
        fits: true,
        scope: null,
        title: "Remember: Left shoulder sore (Oct 27)",
        sub: `Goes in What ${COACH_NAME} knows. Forget it there any time.`,
        done: "Remembered.",
        accept: { kind: "fact", text: "Left shoulder sore" },
      },
    ]);
    const facts = Array.from({ length: 30 }, (_, i) => ({ client_id: `f-${i}`, text: `Fact ${i}`, dated: 0, created_at: "2026-10-20T15:00:00.000Z" }));
    expect(proposalCards(rowsOf({ facts }), [FACT], TODAY, true)).toEqual([]);
  });

  it("keeps only facts for someone with no plan", () => {
    expect(proposalCards(rowsOf(), [swap("week"), { kind: "move", from: "2026-10-28", to: "2026-10-29" }, FACT], TODAY, false).map((c) => c.accept.kind)).toEqual(["fact"]);
  });
});

describe("resultLine", () => {
  it("counts the changes, and says when there are none", () => {
    expect(resultLine(2)).toBe(`${COACH_NAME} suggests 2 changes. Nothing changes until you accept one.`);
    expect(resultLine(1)).toBe(`${COACH_NAME} suggests 1 change. Nothing changes until you accept it.`);
    expect(resultLine(0)).toBe(`${COACH_NAME} has nothing to change for that. Keep it in What ${COACH_NAME} knows?`);
    expect(TELL_FAILED).toBe(`${COACH_NAME} couldn't read that just now. Keep it as written?`);
  });
});

describe("runAccept", () => {
  const recorder = (refuse?: string) => {
    const calls: [string, unknown][] = [];
    const mutate = async (name: string, args: unknown) => {
      calls.push([name, args]);
      return name !== refuse;
    };
    return { calls, mutate };
  };
  const ids = () => {
    const queue = ["w-new", "f-new"];
    return () => queue.shift()!;
  };
  const now = () => new Date("2026-10-27T21:00:00.000Z");

  it("a this-week swap plans the day's workout, then gives it the swapped list", async () => {
    const { calls, mutate } = recorder();
    const [card] = proposalCards(rowsOf(), [swap("week")], TODAY, true);
    expect(await runAccept(card.accept, mutate, ids(), now)).toBe(true);
    const legs = plan.templates[LEGS]!.exercises;
    expect(calls).toEqual([
      ["planWorkout", { clientId: "w-new", date: "2026-10-28", templateId: LEGS, at: "2026-10-27T21:00:00.000Z", scheduled: true }],
      [
        "setLifts",
        {
          workout: "w-new",
          lifts: legs.map((e, position) =>
            position === 4
              ? { position, exercise: RAISE, repMin: e.repMin, repMax: e.repMax, from: "swap", replaces: PRESS }
              : { position, exercise: e.exercise, repMin: e.repMin, repMax: e.repMax, from: "plan" },
          ),
        },
      ],
    ]);
  });

  it("stops at the first change the rules refuse", async () => {
    const { calls, mutate } = recorder("planWorkout");
    const [card] = proposalCards(rowsOf(), [swap("week")], TODAY, true);
    expect(await runAccept(card.accept, mutate, ids(), now)).toBe(false);
    expect(calls.map(([name]) => name)).toEqual(["planWorkout"]);
  });

  it("runs swapAlways, moveWorkout and rememberFact for the other kinds", async () => {
    const { calls, mutate } = recorder();
    const cards = proposalCards(rowsOf(), [swap("always"), MOVE, FACT], TODAY, true);
    const next = ids();
    next(); // The fact takes the second id.
    for (const c of cards) await runAccept(c.accept, mutate, next, now);
    expect(calls).toEqual([
      ["swapAlways", { templateId: LEGS, position: 4, exercise: RAISE }],
      ["moveWorkout", { a: "2026-10-28", b: "2026-10-29" }],
      ["rememberFact", { clientId: "f-new", text: "Left shoulder sore", dated: true }],
    ]);
  });
});

describe("accepting one card after another", () => {
  const ctx = { now: "2026-10-27T21:00:00.000Z", today: TODAY };
  /** The phone's store: each Accept really runs, and the cards read the rows it leaves. */
  function store() {
    const tx = new MemoryTx(new Map());
    const rows = (name: string): Row[] => [...(tx.tables.get(name)?.values() ?? [])];
    const mutate = async (name: string, args: unknown) => {
      try {
        await runMutation(tx, name, args, ctx);
        return true;
      } catch {
        return false;
      }
    };
    let n = 0;
    const accept = (a: Parameters<typeof runAccept>[0]) => runAccept(a, mutate, () => `w-${++n}`, () => new Date(ctx.now));
    const sessions = () => rows("workout_sessions").map((r) => ({ date: r.date, template: r.template_id, lifts: r.lifts ? (JSON.parse(String(r.lifts)) as Lift[]).find((l) => l.position === 4)?.exercise : null }));
    return { tx, rows, accept, sessions };
  }

  it("a Move, then a this-week Swap: the swap follows the workout to its new day", async () => {
    const s = store();
    const cards = proposalCards(s.rows, [MOVE, swap("week")], TODAY, true);
    expect(await s.accept(cards[0].accept)).toBe(true);
    const [, swapCard] = refreshCards(s.rows, cards, TODAY, true);
    expect(swapCard.fits).toBe(true);
    expect(swapCard.sub).toBe("Legs, Shoulders on Thursday, Oct 29. Next week goes back to normal.");
    expect(await s.accept(swapCard.accept)).toBe(true);
    expect(s.sessions()).toEqual([{ date: "2026-10-29", template: LEGS, lifts: RAISE }]);
  });

  it("refuses the swap as first built, rather than plan Wednesday's old workout on a day that now rests", async () => {
    const s = store();
    const cards = proposalCards(s.rows, [MOVE, swap("week")], TODAY, true);
    await s.accept(cards[0].accept);
    expect(await s.accept(cards[1].accept)).toBe(false);
    expect(s.sessions()).toEqual([]);
  });

  it("a this-week Swap, then a Move: the swapped workout moves with its swap", async () => {
    const s = store();
    const cards = proposalCards(s.rows, [swap("week"), MOVE], TODAY, true);
    expect(await s.accept(cards[0].accept)).toBe(true);
    expect(s.sessions()).toEqual([{ date: "2026-10-28", template: LEGS, lifts: RAISE }]);
    const [, moveCard] = refreshCards(s.rows, cards, TODAY, true);
    expect(moveCard.fits).toBe(true);
    expect(await s.accept(moveCard.accept)).toBe(true);
    expect(s.sessions()).toEqual([{ date: "2026-10-29", template: LEGS, lifts: RAISE }]);
  });

  it("marks a card that no longer fits, so it can't be accepted", async () => {
    const s = store();
    const cards = proposalCards(s.rows, [MOVE, { kind: "move", from: "2026-10-28", to: "2026-10-30" }], TODAY, true);
    await s.accept(cards[0].accept);
    // Wednesday rests now, so there is nothing left there to move.
    const [, second] = refreshCards(s.rows, cards, TODAY, true);
    expect(second).toMatchObject({ fits: false, title: cards[1].title });
  });
});

describe("sendButton", () => {
  it("reads Send, disabled, while the AI status check is out", () => {
    expect(sendButton({ ready: false, checking: true }, false)).toEqual({ label: "Send", disabled: true });
  });

  it("needs a signal only once the check has failed or the phone is offline", () => {
    expect(sendButton({ ready: false, checking: false }, false)).toEqual({ label: "Needs a signal", disabled: true });
  });

  it("sends when ready, and reads Reading while the note is out", () => {
    expect(sendButton({ ready: true, checking: false }, false)).toEqual({ label: "Send", disabled: false });
    expect(sendButton({ ready: true, checking: false }, true)).toEqual({ label: "Reading", disabled: true });
  });
});

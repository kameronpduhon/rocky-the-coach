// The workout screens' writes, as named changes. A workout not saved yet is planned by its first change, so every
// tap works on the phone with no signal. Pure apart from the mutate it is handed, so the unit tests run it.
import type { Feel } from "~/domain/progression";
import type { MutationName } from "~/sync/mutators";
import { swapForGood, type Lift } from "./lifts";
import type { LiftView, WorkoutModel } from "./model";

export type Mutate = (name: MutationName, args: unknown) => Promise<boolean>;

const toLift = ({ position, exercise, repMin, repMax, from, replaces }: Lift): Lift =>
  replaces ? { position, exercise, repMin, repMax, from, replaces } : { position, exercise, repMin, repMax, from };

export function workoutActions(m: WorkoutModel, mutate: Mutate, now: () => Date = () => new Date(), newId: () => string = () => crypto.randomUUID()) {
  const at = () => now().toISOString();

  async function ensure(templateId = m.templateId): Promise<string | null> {
    if (m.key) return m.key;
    if (!templateId) return null;
    const clientId = newId();
    return (await mutate("planWorkout", { clientId, date: m.date, templateId, at: at() })) ? clientId : null;
  }

  async function editLifts(change: (list: Lift[]) => Lift[]): Promise<boolean> {
    const key = await ensure();
    return key !== null && mutate("setLifts", { workout: key, lifts: change(m.lifts.map(toLift)) });
  }

  const withKey = (run: (key: string) => Promise<boolean>) => (m.key ? run(m.key) : Promise.resolve(false));

  return {
    /** Picking another workout before Start. The open workout is retargeted; with none, one is planned. */
    pick: async (templateId: string) => (m.key ? mutate("planWorkout", { clientId: newId(), date: m.date, templateId, at: at() }) : (await ensure(templateId)) !== null),
    editLifts,
    /** "Done, see you at noon": a workout picked but not written yet is saved. */
    save: async () => (await ensure()) !== null,
    start: async () => {
      const key = await ensure();
      return key !== null && mutate("startWorkout", { workout: key, at: at() });
    },
    /** A past day logged after the fact: saved as finished, then its sets go in from Done. */
    logLate: async () => {
      const key = await ensure();
      return key !== null && mutate("finishWorkout", { workout: key, at: at() });
    },
    logSet: (lift: LiftView, setNumber: number, weightLb: number, reps: number) =>
      withKey((workout) => mutate("logSet", { clientId: newId(), workout, position: lift.position, exercise: lift.exercise, setNumber, weightLb, reps, at: at() })),
    editSet: (key: string, weightLb: number, reps: number) => mutate("editSet", { key, weightLb, reps }),
    deleteSet: (key: string) => mutate("deleteSet", { key }),
    check: (lift: LiftView, done: boolean) => withKey((workout) => mutate("checkLift", { workout, exercise: lift.exercise, done })),
    finish: () => withKey((workout) => mutate("finishWorkout", { workout, at: at() })),
    /** A workout finished by the next-day rule has no end written, so it gets its last set's time first. */
    rate: (feel: Feel | null) =>
      withKey(async (workout) => {
        if (!m.endedAt && !(await mutate("finishWorkout", { workout, at: m.finishedAt ?? at() }))) return false;
        return mutate("rateWorkout", { workout, feel });
      }),
    note: (exercise: string, note: string) => mutate("setNote", { exercise, note }),
    swapAlways: async (lift: LiftView, exercise: string) => {
      if (!m.templateId || !(await mutate("swapAlways", { templateId: m.templateId, position: lift.position, exercise }))) return false;
      return editLifts((list) => swapForGood(list, lift.position, exercise));
    },
  };
}

export type WorkoutActions = ReturnType<typeof workoutActions>;

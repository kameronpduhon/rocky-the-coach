import { useMemo } from "react";
import { useMutate } from "~/sync/react";
import { workoutActions } from "./actions";
import type { WorkoutModel } from "./model";

export function useWorkoutActions(m: WorkoutModel) {
  const mutate = useMutate();
  return useMemo(() => workoutActions(m, mutate), [m, mutate]);
}

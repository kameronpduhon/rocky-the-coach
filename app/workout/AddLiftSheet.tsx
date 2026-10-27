import { ExercisePicker } from "~/components/ExercisePicker";
import { Sheet } from "~/components/Sheet";
import { CATALOG, type Lift } from "./lifts";

export function AddLiftSheet({ open, lifts, onAdd, onClose }: { open: boolean; lifts: Lift[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const inList = new Set(lifts.map((l) => l.exercise));
  return (
    <Sheet open={open} onClose={onClose} title="Add a lift">
      <ExercisePicker
        catalog={CATALOG}
        initial={[]}
        locked={inList}
        lockedLabel="In today's list"
        saveLabel={(count) => {
          const picked = count - inList.size;
          return picked <= 0 ? "Pick a lift" : `Add ${picked} lift${picked === 1 ? "" : "s"}`;
        }}
        onSave={(ids) => {
          onClose();
          onAdd(ids);
        }}
      />
    </Sheet>
  );
}

import { useState } from "react";
import { GROUP_LABEL } from "~/content";
import { Icon } from "./ui";

export interface CatalogExercise {
  id: string;
  name: string;
  group: string;
  equipment: string;
  image: string;
}

const EQUIPMENT: Record<string, string> = { machine: "Machine", cable: "Cable", dumbbell: "Dumbbell", barbell: "Barbell", "body-weight": "Body weight" };

/**
 * Checklist of every exercise by muscle group, for building a workout from what was actually done. Locked ones
 * already have sets or a check logged, so they stay in.
 */
export function ExercisePicker({
  catalog,
  initial,
  locked,
  saveLabel,
  onSave,
}: {
  catalog: CatalogExercise[];
  initial: string[];
  locked: Set<string>;
  saveLabel: (count: number) => string;
  onSave: (ids: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = Object.entries(GROUP_LABEL)
    .map(([group, label]) => ({ group, label, list: catalog.filter((e) => e.group === group && e.name.toLowerCase().includes(q)) }))
    .filter((g) => g.list.length > 0);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-fill px-3">
        <span className="sr-only">Search exercises</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          className="w-full min-w-0 bg-transparent text-[17px] text-label outline-none placeholder:text-label-on-fill"
        />
      </label>
      {groups.length === 0 && <p className="px-1 text-[15px] text-label-2">Nothing matches "{query.trim()}".</p>}
      {groups.map((g) => (
        <section key={g.group} aria-label={g.label} className="flex flex-col gap-1.5">
          <h3 className="px-1 pt-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">{g.label}</h3>
          <div className="overflow-hidden rounded-[22px] bg-card">
            {g.list.map((e) => {
              const on = chosen.includes(e.id) || locked.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={on}
                  disabled={locked.has(e.id)}
                  onClick={() => toggle(e.id)}
                  className="flex w-full items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-2.5 text-left last:border-b-0"
                >
                  <img src={e.image} alt="" className="size-12 flex-none rounded-xl bg-fill object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold">{e.name}</div>
                    <div className="mt-px text-[14px] text-label-2">{locked.has(e.id) ? "Logged" : (EQUIPMENT[e.equipment] ?? e.equipment)}</div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`flex size-7 flex-none items-center justify-center rounded-full ${on ? "bg-steps text-black" : "border-2 border-label-4 text-transparent"}`}
                  >
                    <Icon name="check" size={15} strokeWidth={3.2} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-[var(--surface,var(--bg))] from-60% to-transparent px-1 pb-1 pt-4">
        <button
          type="button"
          disabled={chosen.length === 0 && locked.size === 0}
          onClick={() => onSave(chosen)}
          className="btn-prominent h-[52px] w-full rounded-full text-[17px] font-semibold disabled:opacity-50"
        >
          {saveLabel(new Set([...chosen, ...locked]).size)}
        </button>
      </div>
    </div>
  );
}

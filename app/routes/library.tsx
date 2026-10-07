import { env } from "cloudflare:workers";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/library";
import { MealPhoto } from "~/components/MealPhoto";
import { Segmented } from "~/components/Segmented";
import { Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { exerciseImage, exercises, GROUP_LABEL, meals, plan } from "~/content";
import { getDb } from "~/db/client";
import { exerciseOverrides, mealState } from "~/db/schema";
import { localDate } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";

export function meta() {
  return [{ title: "Library · Rocky" }];
}

const POOL_LABEL: Record<string, string> = { breakfast: "Breakfasts", main: "Lunch and dinner", snack: "Snacks", dessert: "Desserts" };
const TEMPLATE_DAY: Record<string, string> = {
  "mon-chest-back-arms": "Mon",
  "wed-legs-shoulders": "Wed",
  "fri-chest-shoulders-arms": "Fri",
  "optional-arms-back": "Tue or Thu optional",
  "plan-b-home": "Plan B",
};
const EQUIPMENT: Record<string, string> = { barbell: "Barbell", "body-weight": "Body weight", cable: "Cable", dumbbell: "Dumbbells", machine: "Machine" };

export async function loader(_args: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const [state, overrides] = await Promise.all([db.select().from(mealState).all(), db.select().from(exerciseOverrides).all()]);
  const today = localDate(serverNow());
  const usedBy = new Map<string, string[]>();
  for (const [id, t] of Object.entries(plan.templates)) {
    t.exercises.forEach((e, position) => {
      const chosen = overrides.find((o) => o.templateId === id && o.position === position)?.exerciseId ?? e.exercise;
      usedBy.set(chosen, [...(usedBy.get(chosen) ?? []), TEMPLATE_DAY[id] ?? t.name]);
    });
  }
  const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    meals: [...meals.values()]
      .map((m) => {
        const s = state.find((x) => x.slug === m.slug);
        const restedUntil = s?.restedUntil && s.restedUntil >= today ? short(s.restedUntil) : null;
        return { slug: m.slug, name: m.name, pool: m.pool, weekendOnly: m.mode === "weekend", kcal: m.kcal, protein: m.protein, photoKey: s?.photoKey ?? null, restedUntil };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    exercises: [...exercises.values()]
      .map((e) => ({ id: e.id, name: e.name, group: e.group, equipment: EQUIPMENT[e.equipment] ?? e.equipment, image: exerciseImage(e, 0), usedBy: [...new Set(usedBy.get(e.id) ?? [])] }))
      .sort((a, b) => Number(b.usedBy.length > 0) - Number(a.usedBy.length > 0) || a.name.localeCompare(b.name)),
  };
}

export default function Library({ loaderData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "exercises" ? "exercises" : "meals";
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const empty = (
    <Card className="px-[18px] py-4 text-[15px] text-label-2">
      Nothing matches "{query.trim()}".
    </Card>
  );

  const mealGroups = (["breakfast", "main", "snack", "dessert"] as const)
    .map((pool) => ({ pool, list: loaderData.meals.filter((m) => m.pool === pool && m.name.toLowerCase().includes(q)) }))
    .filter((g) => g.list.length > 0);
  const exerciseGroups = Object.entries(GROUP_LABEL)
    .map(([group, label]) => ({ group, label, list: loaderData.exercises.filter((e) => e.group === group && e.name.toLowerCase().includes(q)) }))
    .filter((g) => g.list.length > 0);

  return (
    <Screen>
      <LargeTitle eyebrow={`${loaderData.meals.length} meals · ${loaderData.exercises.length} exercises`} title="Library" />
      <Segmented
        label="Library section"
        options={[
          { value: "meals", label: "Meals" },
          { value: "exercises", label: "Exercises" },
        ]}
        value={tab}
        onChange={(v) => setParams(v === "meals" ? {} : { tab: v }, { replace: true, preventScrollReset: true })}
      />
      <div className="flex h-11 items-center gap-2 rounded-[14px] bg-fill px-3 text-label-on-fill">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <label className="sr-only" htmlFor="q">
          Search {tab}
        </label>
        <input
          id="q"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "meals" ? "Search meals" : "Search exercises"}
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-label outline-none placeholder:text-label-on-fill"
        />
      </div>

      {tab === "meals"
        ? mealGroups.length === 0
          ? empty
          : mealGroups.map(({ pool, list }) => (
              <section key={pool} aria-label={POOL_LABEL[pool]} className="flex flex-col gap-2">
                <SectionTitle right={<span className="tabular">{list.length}</span>}>{POOL_LABEL[pool]}</SectionTitle>
                <Card className="overflow-hidden">
                  {list.map((m) => {
                    const meta = [m.weekendOnly ? "Weekends only" : null, m.restedUntil ? `Resting until ${m.restedUntil}` : null].filter(Boolean).join(" · ");
                    return (
                      <Link key={m.slug} to={`/meal/${m.slug}?from=library`} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                        <MealPhoto photoKey={m.photoKey} alt="" className="size-[54px] flex-none rounded-[14px]" />
                        <div className="min-w-0 flex-1">
                          {meta && <div className="text-[13px] text-label-2">{meta}</div>}
                          <div className={`mt-px text-[16px] font-semibold ${m.restedUntil ? "text-label-2" : ""}`}>{m.name}</div>
                          <div className="tabular mt-px text-[13px] text-label-2">
                            {m.kcal} cal · {m.protein} g protein
                          </div>
                        </div>
                        <span className="flex-none text-label-4">
                          <Icon name="chevron" size={18} strokeWidth={2.4} />
                        </span>
                      </Link>
                    );
                  })}
                </Card>
              </section>
            ))
        : exerciseGroups.length === 0
          ? empty
          : exerciseGroups.map(({ group, label, list }) => (
              <section key={group} aria-label={label} className="flex flex-col gap-2">
                <SectionTitle right={<span className="tabular">{list.length}</span>}>{label}</SectionTitle>
                <Card className="overflow-hidden">
                  {list.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                      <img src={e.image} alt="" className="size-[54px] flex-none rounded-[14px] bg-fill object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-label-2">{e.equipment}</div>
                        <div className="mt-px text-[16px] font-semibold">{e.name}</div>
                        <div className="mt-px text-[13px] text-label-2">{e.usedBy.length ? `In the plan: ${e.usedBy.join(", ")}` : "Swap option"}</div>
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            ))}
    </Screen>
  );
}

import { env } from "cloudflare:workers";
import { useState } from "react";
import { redirect, useFetcher } from "react-router";
import type { Route } from "./+types/meal";
import { MealPhoto } from "~/components/MealPhoto";
import { Segmented } from "~/components/Segmented";
import { Sheet } from "~/components/Sheet";
import { BackButton, Card, Icon } from "~/components/ui";
import { foods, meals, plan } from "~/content";
import { getDb } from "~/db/client";
import { dayMode } from "~/domain/calendar";
import { formatClock, mealDate, parseTime } from "~/domain/dates";
import { scaleGrams } from "~/domain/macros";
import { SLOTS, slotPool, type Slot } from "~/domain/types";
import { mealState } from "~/db/schema";
import { eq } from "drizzle-orm";
import { loadDay } from "~/server/day.server";
import { restedSlugs, swapPlanned } from "~/server/meal-plan.server";
import { createBatch, logPlannedMeal, mainProtein, openBatch } from "~/server/meals.server";
import { saveMealPhoto } from "~/server/photos.server";
import { serverNow } from "~/server/clock.server";

export const handle = { hideTabBar: true };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.meal.name ?? "Meal"} · Rocky` }];
}

const STATE_LABEL = { raw: "Raw", cooked: "Cooked", "as-is": "As is" } as const;

export async function loader({ request, params }: Route.LoaderArgs) {
  const meal = meals.get(params.slug);
  if (!meal) throw new Response("Not found", { status: 404 });
  const db = getDb(env.DB);
  const now = serverNow();
  const date = mealDate(now);
  const day = await loadDay(db, date, now);
  const requested = new URL(request.url).searchParams.get("slot") as Slot | null;
  const plannedSlot = day.slots.find((s) => s.meal.slug === meal.slug && (!requested || s.slot === requested));
  const slot = plannedSlot?.slot ?? (requested && SLOTS.includes(requested) ? requested : null);

  const rested = await restedSlugs(db, date);
  const mode = dayMode(date);
  const unlogged = day.slots.filter((s) => s.logId === null).length || 1;
  const perSlot = (day.targets.kcal - day.totals.kcal) / unlogged;
  const swapOptions = [...meals.values()]
    .filter((m) => m.pool === meal.pool && m.slug !== meal.slug && (m.mode === "any" || mode === "weekend") && !rested.includes(m.slug))
    .sort((a, b) => Math.abs(a.kcal - perSlot) - 2 * a.protein - (Math.abs(b.kcal - perSlot) - 2 * b.protein));

  const main = mainProtein(meal);
  const photo = await db.select().from(mealState).where(eq(mealState.slug, meal.slug)).get();
  return {
    meal,
    slot,
    slotTime: slot ? formatClock(parseTime(plan.slotTimes[slot])) : null,
    logged: plannedSlot ? plannedSlot.logId !== null : false,
    ingredients: meal.ingredients.map((i) => {
      const f = foods.get(i.food)!;
      return { food: i.food, name: f.name, state: STATE_LABEL[f.state], grams: i.grams, note: i.note ?? null, eachG: f.eachG ?? null, eachLabel: f.eachLabel ?? null };
    }),
    mainProtein: { food: main.food, name: foods.get(main.food)!.name },
    batch: await openBatch(db, meal.slug, date),
    photoKey: photo?.photoKey ?? null,
    swapOptions,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const meal = meals.get(params.slug);
  if (!meal) throw new Response("Not found", { status: 404 });
  const db = getDb(env.DB);
  const now = serverNow();
  const date = mealDate(now);
  const form = await request.formData();
  switch (form.get("intent")) {
    case "ate": {
      const slot = String(form.get("slot")) as Slot;
      if (!SLOTS.includes(slot)) return { error: "Pick a slot" };
      await logPlannedMeal(db, date, slot, meal, now);
      return redirect("/");
    }
    case "batch": {
      const portions = Number(form.get("portions"));
      const cooked = Number(form.get("cookedWeight"));
      if (![2, 3].includes(portions) || !Number.isFinite(cooked) || cooked <= 0) return { error: "Enter the cooked weight in grams." };
      await createBatch(db, meal.slug, portions, Math.round(cooked), date);
      return { ok: true };
    }
    case "swap": {
      const slot = String(form.get("slot")) as Slot;
      const to = meals.get(String(form.get("to")));
      if (!to || !SLOTS.includes(slot) || slotPool(slot) !== to.pool) return { error: "That meal doesn't fit this slot." };
      await swapPlanned(db, date, slot, to.slug, form.get("always") === "true", date);
      return redirect(`/meal/${to.slug}?slot=${slot}`);
    }
    case "photo": {
      const file = form.get("photo");
      if (!(file instanceof File)) return { error: "Choose a photo." };
      await saveMealPhoto(db, meal.slug, file);
      return { ok: true };
    }
    default:
      return { error: "Unknown action" };
  }
}

const PORTIONS = [
  { value: 1, label: "1 portion" },
  { value: 2, label: "2 days" },
  { value: 3, label: "3 days" },
];

export default function MealScreen({ loaderData }: Route.ComponentProps) {
  const { meal, slot, slotTime, logged, ingredients, mainProtein, batch, photoKey, swapOptions } = loaderData;
  const [portions, setPortions] = useState(1);
  const [swapOpen, setSwapOpen] = useState(false);
  const ate = useFetcher<typeof action>();
  const batchFetcher = useFetcher<typeof action>();

  return (
    <div className="relative mx-auto min-h-dvh max-w-[760px] pb-36">
      <div className="relative h-[320px]">
        <MealPhoto photoKey={photoKey} alt={meal.name} className="h-full w-full" hero />
        <div className="absolute left-4 top-[max(54px,env(safe-area-inset-top))]">
          <BackButton to="/" label="Back to Today" onImage={photoKey !== null} />
        </div>
        {slot && (
          <button type="button" onClick={() => setSwapOpen(true)} className={`${photoKey ? "glass-on-image" : "glass"} absolute right-4 top-[max(54px,env(safe-area-inset-top))] flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold`}>
            <Icon name="swap" size={16} />
            Swap
          </button>
        )}
        {!photoKey && <PhotoButton />}
      </div>

      <main className="flex flex-col gap-5 px-4 pt-[22px]">
        <header className="px-1">
          {slot && (
            <div className="text-[15px] font-semibold capitalize text-label-2">
              {slot} · {slotTime}
            </div>
          )}
          <h1 className="mt-0.5 text-[30px] font-bold leading-tight">{meal.name}</h1>
          <div className="tabular mt-3 flex gap-2">
            <span className="flex h-[30px] items-center rounded-full px-3 text-[14px] font-semibold text-[var(--calories-chip-fg)] bg-[var(--calories-chip-bg)]">
              {meal.kcal} cal
            </span>
            <span className="flex h-[30px] items-center rounded-full px-3 text-[14px] font-semibold text-[var(--protein-chip-fg)] bg-[var(--protein-chip-bg)]">
              {meal.protein} g protein
            </span>
            <span className="flex h-[30px] items-center rounded-full bg-card px-3 text-[14px] font-semibold text-label-2">per portion</span>
          </div>
        </header>

        {batch && (
          <Card className="p-[18px]">
            <div className="text-[13px] font-semibold text-label-2">From your batch</div>
            <div className="tabular mt-1 text-[17px]">
              Put <strong className="text-[22px]">{batch.portionG} g</strong> cooked {mainProtein.name.toLowerCase()} on the scale
            </div>
            <div className="mt-1 text-[14px] text-label-2">{batch.portionsLeft} portion{batch.portionsLeft === 1 ? "" : "s"} left</div>
          </Card>
        )}

        <section className="flex flex-col gap-2">
          <div className="px-1 text-[13px] font-semibold text-label-2">COOKING FOR</div>
          <Segmented label="Cooking for" options={PORTIONS} value={portions} onChange={setPortions} />
        </section>

        <Card className="px-[18px] py-1">
          <div className="flex items-center justify-between pb-2 pt-3.5">
            <h2 className="text-[17px] font-semibold">Put on the scale</h2>
            <span className="text-[14px] text-label-2">{portions === 1 ? "1 portion" : `${portions} portions total`}</span>
          </div>
          {ingredients.map((i) => {
            const grams = scaleGrams(i.grams, portions);
            const each = i.eachG ? Math.round(grams / i.eachG) : null;
            return (
              <div key={i.food} className="flex items-center justify-between border-t-[0.5px] border-separator py-[13px]">
                <div>
                  <div className="text-[16px] font-medium">{i.name}</div>
                  <div className="text-[13px] text-label-3">{[i.state, portions > 1 ? `${scaleGrams(i.grams, 1).toLocaleString()} g per portion` : null, i.note, each && i.eachLabel ? `about ${each} ${i.eachLabel}${each === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="tabular text-[26px] font-bold">
                  {grams.toLocaleString()}
                  <span className="ml-0.5 text-[15px] font-semibold text-label-2">g</span>
                </div>
              </div>
            );
          })}
        </Card>

        {portions > 1 && (
          <Card className="flex flex-col gap-3 p-[18px]">
            <h2 className="text-[17px] font-semibold">After cooking</h2>
            <p className="text-[15px] leading-[1.45] text-label-2">
              Put all the cooked {mainProtein.name.toLowerCase()} on the scale and enter the number. Rocky splits it into {portions} equal portions.
            </p>
            <batchFetcher.Form method="post" className="flex flex-col gap-1.5">
              <label htmlFor="cooked" className="text-[13px] font-semibold text-label-2">
                Cooked {mainProtein.name.toLowerCase()}, whole batch
              </label>
              <div className="flex items-center gap-2">
              <input type="hidden" name="intent" value="batch" />
              <input type="hidden" name="portions" value={portions} />
              <div className="flex h-[52px] flex-1 items-center gap-2 rounded-[14px] bg-fill px-3.5">
                <input id="cooked" name="cookedWeight" inputMode="numeric" placeholder="0" required className="tabular w-full min-w-0 bg-transparent text-[20px] font-semibold outline-none" />
                <span className="font-semibold text-label-2">g</span>
              </div>
              <button type="submit" className="glass h-[52px] rounded-full px-5 text-[16px] font-semibold">
                Split
              </button>
              </div>
            </batchFetcher.Form>
            {batchFetcher.data && "ok" in batchFetcher.data && <p className="text-[14px] text-steps">Saved. The next {portions - 1} days will show your portion.</p>}
          </Card>
        )}

        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-[17px] font-semibold">Steps</h2>
          <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-[16px] leading-[1.45] text-label">
            {meal.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Card>
      </main>

      {slot && (
        <div className="glass-bar fixed inset-x-4 bottom-[max(28px,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[728px] gap-2.5 rounded-[34px] p-1.5">
          <ate.Form method="post" className="flex-1">
            <input type="hidden" name="intent" value="ate" />
            <input type="hidden" name="slot" value={slot} />
            <button type="submit" disabled={logged} className="btn-prominent h-[54px] w-full rounded-full text-[17px] font-semibold disabled:opacity-60">
              {logged ? "Eaten" : ate.state !== "idle" ? "Saving..." : "Ate it"}
            </button>
          </ate.Form>
        </div>
      )}

      {slot && <SwapSheet open={swapOpen} onClose={() => setSwapOpen(false)} slot={slot} options={swapOptions} />}
    </div>
  );
}

function PhotoButton() {
  const fetcher = useFetcher();
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
    const body = new FormData();
    body.set("intent", "photo");
    body.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    fetcher.submit(body, { method: "post", encType: "multipart/form-data" });
  }
  return (
    <label className="glass absolute bottom-4 right-4 flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold">
      <Icon name="camera" size={16} />
      {fetcher.state !== "idle" ? "Uploading..." : "Add photo"}
      <input type="file" accept="image/*" capture="environment" onChange={onChange} className="sr-only" />
    </label>
  );
}

function SwapSheet({ open, onClose, slot, options }: { open: boolean; onClose: () => void; slot: Slot; options: { slug: string; name: string; kcal: number; protein: number }[] }) {
  const [always, setAlways] = useState(false);
  const fetcher = useFetcher();
  return (
    <Sheet open={open} onClose={onClose} title="Swap meal">
      <Segmented
        label="Swap for"
        options={[
          { value: "today", label: "Just today" },
          { value: "always", label: "Always" },
        ]}
        value={always ? "always" : "today"}
        onChange={(v) => setAlways(v === "always")}
      />
      <p className="mt-2 px-1 text-[13px] text-label-2">{always ? "The current meal rests for 4 weeks." : "Only today's plan changes."}</p>
      <div className="mt-3 overflow-hidden rounded-[20px] bg-card">
        {options.map((m) => (
          <button
            key={m.slug}
            type="button"
            onClick={() => fetcher.submit({ intent: "swap", slot, to: m.slug, always: String(always) }, { method: "post" })}
            className="flex w-full items-center justify-between border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0"
          >
            <span className="text-[16px] font-semibold">{m.name}</span>
            <span className="tabular text-[14px] text-label-2">
              {m.kcal} cal · {m.protein} g
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

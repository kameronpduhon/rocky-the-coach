import { env } from "cloudflare:workers";
import { useFetcher } from "react-router";
import type { Route } from "./+types/groceries";
import { BackButton, Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { foods } from "~/content";
import { getDb } from "~/db/client";
import { localDate, weekStart } from "~/domain/dates";
import { parseSwaps } from "~/domain/next-week";
import { serverNow } from "~/server/clock.server";
import { groceryList, setGroceryCheck } from "~/server/groceries.server";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Groceries · Rocky" }];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const param = url.searchParams.get("week");
  const today = localDate(serverNow());
  const monday = param && ISO.test(param) ? weekStart(param) : weekStart(today);
  const list = await groceryList(getDb(env.DB), monday, today, {
    rest: url.searchParams.has("rest") ? url.searchParams.getAll("rest").filter(Boolean) : null,
    swaps: parseSwaps(url.searchParams.getAll("swap")),
  });
  return { ...list, back: url.searchParams.get("from") === "check-in" ? "/check-in" : "/plan" };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const week = String(form.get("week"));
  const food = String(form.get("food"));
  if (!ISO.test(week) || !foods.has(food)) return { error: "Bad request" };
  await setGroceryCheck(getDb(env.DB), weekStart(week), food, form.get("checked") === "true");
  return { ok: true };
}

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Groceries({ loaderData }: Route.ComponentProps) {
  const { monday, planned, groups, count, checked, back } = loaderData;
  return (
    <Screen>
      <BackButton to={back} label={back === "/check-in" ? "Back to check-in" : "Back to Plan"} />
      <header className="px-1">
        <div className="tabular text-[15px] font-semibold text-label-2">
          Week of {short(monday)} · {count} items
        </div>
        <h1 className="mt-0.5 text-[34px] font-bold">Groceries</h1>
        <p className="mt-1.5 text-[15px] leading-snug text-label-2">
          {planned ? "Everything for the week's planned meals, summed across days. Check items off as they go in the cart." : "Built from next week's meals as the check-in has them. It updates when you finish the check-in."}
        </p>
      </header>
      {groups.length === 0 && <Card className="px-[18px] py-4 text-[15px] text-label-2">No meals planned for this week yet.</Card>}
      {groups.map((g) => {
        const done = g.items.filter((i) => checked.includes(i.foodId)).length;
        return (
          <section key={g.section} aria-label={g.label} className="flex flex-col gap-2">
            <SectionTitle right={<span className="tabular">{done > 0 ? `${done} of ${g.items.length}` : `${g.items.length} items`}</span>}>{g.label}</SectionTitle>
            <Card className="overflow-hidden">
              {g.items.map((i) => (
                <GroceryRow key={i.foodId} week={monday} item={i} checked={checked.includes(i.foodId)} />
              ))}
            </Card>
          </section>
        );
      })}
    </Screen>
  );
}

function GroceryRow({ week, item, checked }: { week: string; item: { foodId: string; name: string; grams: number; each: string | null }; checked: boolean }) {
  const fetcher = useFetcher();
  const on = fetcher.formData ? fetcher.formData.get("checked") === "true" : checked;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={() => fetcher.submit({ week, food: item.foodId, checked: String(!on) }, { method: "post" })}
      className="flex min-h-[60px] w-full items-center gap-3.5 border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0"
    >
      <span
        aria-hidden="true"
        className={`flex size-[26px] flex-none items-center justify-center rounded-full ${on ? "bg-steps text-black" : "shadow-[inset_0_0_0_1.5px_var(--label-3)]"}`}
      >
        {on && <Icon name="check" size={15} strokeWidth={3.2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-medium ${on ? "text-label-2 line-through" : ""}`}>{item.name}</span>
        {item.each && <span className="block text-[13px] text-label-2">{item.each}</span>}
      </span>
      <span className={`tabular flex-none text-[20px] font-bold ${on ? "text-label-2" : ""}`}>
        {item.grams.toLocaleString()}
        <span className="ml-0.5 text-[14px] font-semibold text-label-2">g</span>
      </span>
    </button>
  );
}

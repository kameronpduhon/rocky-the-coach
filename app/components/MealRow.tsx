import { Link } from "react-router";
import type { SlotView } from "~/server/day.server";
import { MealPhoto } from "./MealPhoto";
import { Icon } from "./ui";

const LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", dessert: "Dessert" };

export function MealRow({ s, upNext }: { s: SlotView; upNext: boolean }) {
  const eaten = s.logId !== null;
  return (
    <Link to={`/meal/${s.meal.slug}?slot=${s.slot}`} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
      <MealPhoto photoKey={s.photoKey} alt="" className="size-[54px] flex-none rounded-[14px]" />
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] ${upNext ? "font-semibold text-label" : "text-label-3"}`}>
          {LABEL[s.slot]} · {s.time}
          {upNext && " · Up next"}
          {s.slot === "dessert" && " · kitchen closes after"}
        </div>
        <div className={`mt-px text-[16px] font-semibold ${eaten ? "text-label-2" : ""}`}>{s.meal.name}</div>
        <div className={`tabular mt-px text-[13px] ${eaten ? "text-label-3" : "text-label-2"}`}>
          {s.meal.kcal} cal · {s.meal.protein} g protein
        </div>
      </div>
      {eaten ? (
        <span aria-label="Eaten" className="flex size-7 flex-none items-center justify-center rounded-full bg-steps text-black">
          <Icon name="check" size={15} strokeWidth={3.2} />
        </span>
      ) : (
        <span className="flex-none text-label-4">
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </span>
      )}
    </Link>
  );
}

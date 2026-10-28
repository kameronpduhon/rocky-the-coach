// Describe-a-meal (spec section 3). The model only splits the text into foods with grams and maps each to a
// food-table id. The phone computes every calorie and protein number from the table.
import { z } from "zod";

const MAX_ITEMS = 12;
const MAX_GRAMS = 2000;
const NAME_MAX = 60;

/** The model's reply, and the route's. Lengths and counts are tidied by tidyDescribe, not refused. */
export const DescribeSchema = z.object({
  name: z.string(),
  category: z.enum(["meal", "snack", "dessert", "drink"]),
  items: z.array(z.object({ label: z.string(), foodId: z.string().nullable(), grams: z.number() })).max(40),
});
export type DescribeReply = z.infer<typeof DescribeSchema>;

/** The route's answer when the model failed. It fails DescribeSchema, so the phone reads it as no plate. */
export const NO_PLATE = { items: null };

/** The reply as the plate takes it: at most 12 foods, whole grams from 1 to 2,000, and only the table's ids. */
export function tidyDescribe(reply: DescribeReply, isFood: (id: string) => boolean): DescribeReply {
  return {
    name: reply.name.trim().slice(0, NAME_MAX).trim() || "Something else",
    category: reply.category,
    items: reply.items.slice(0, MAX_ITEMS).map((i) => ({
      label: i.label.trim().slice(0, NAME_MAX),
      foodId: i.foodId !== null && isFood(i.foodId) ? i.foodId : null,
      grams: Math.min(MAX_GRAMS, Math.max(1, Math.round(i.grams))),
    })),
  };
}

// A nutrition label, read by the model from a photo. Both sides use it: the Worker sends LabelSchema as the
// structured-output format, and the phone parses the reply with it.
import { z } from "zod";

/** What the panel prints, per serving. The bounds are loose on purpose: labelSane is the real check, on the phone. */
export const LabelSchema = z.object({
  /** False when there is no Nutrition Facts panel to read. */
  readable: z.boolean(),
  name: z.string().max(80).nullable(),
  servingText: z.string().max(40).nullable(),
  servingGrams: z.number().min(0).max(2000).nullable(),
  kcal: z.number().min(0).max(5000).nullable(),
  proteinG: z.number().min(0).max(500).nullable(),
});
export type LabelRead = z.infer<typeof LabelSchema>;

/** The label route's answer when the model couldn't read the photo, or failed. */
export const UNREADABLE: LabelRead = { readable: false, name: null, servingText: null, servingGrams: null, kcal: null, proteinG: null };

/** A label read the card may show: calories 0 to 2,000, protein 0 to 200 g, and no more protein than the calories allow. */
export function labelSane(kcal: number, proteinG: number): boolean {
  return kcal >= 0 && kcal <= 2000 && proteinG >= 0 && proteinG <= 200 && proteinG * 4 <= kcal + 20;
}

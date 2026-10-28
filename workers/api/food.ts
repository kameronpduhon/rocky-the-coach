// /api/food/*: food lookups that are not AI. No key, no switch and no cap, so they work with the AI off.
import { gtinValid } from "~/ai/barcode";
import { lookupBarcode } from "~/ai/off.server";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/food/barcode/:code. The Worker's own cache answers repeats; the phone's copy is never cached. */
export async function barcode(_request: Request, [code = ""]: string[]): Promise<Response> {
  if (!gtinValid(code)) return Response.json({ error: "Not a barcode" }, { status: 400, headers: NO_STORE });
  return Response.json(await lookupBarcode(code), { headers: NO_STORE });
}

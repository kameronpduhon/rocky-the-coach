import { redirect } from "react-router";

export type ServerSettings = { otherName: string | null; ingestUrl: string; ingestToken: string | null; vapidPublicKey: string };

/** The parts of Settings only the server knows. Null offline: the screen opens and says what needs a signal. */
export async function loadSettings(send: typeof fetch = fetch): Promise<ServerSettings | null> {
  let res: Response;
  try {
    res = await send("/api/settings");
  } catch {
    return null;
  }
  if (res.status === 401) throw redirect("/login");
  return res.ok ? ((await res.json()) as ServerSettings) : null;
}

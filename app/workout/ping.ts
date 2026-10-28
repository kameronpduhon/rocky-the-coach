// The locked-phone rest ping (spec section 3). Fire-and-forget: the countdown on screen never waits on these calls.

export const PING_TITLE = "Rest's up";

export const pingBody = (lift: string, setNumber: number) => `Set ${setNumber} of ${lift}.`;

/** Schedules the ping, replacing any earlier one. Resolves false when the call didn't get through. */
export async function schedulePing(seconds: number, body: string, send: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await send("/api/rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: Math.min(600, Math.max(1, Math.round(seconds))), title: PING_TITLE, body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function cancelPing(send: typeof fetch = fetch): Promise<boolean> {
  try {
    return (await send("/api/rest", { method: "DELETE" })).ok;
  } catch {
    return false;
  }
}

/** This phone can get the ping: notifications allowed and a push subscription saved (Settings makes both). */
export async function notificationsOn(): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  return Boolean(await reg?.pushManager.getSubscription().catch(() => null));
}

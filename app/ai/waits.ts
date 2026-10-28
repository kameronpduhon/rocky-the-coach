// How long each side waits on an AI route. The phone gives up at its wait and shows its own path, and a Worker whose
// phone has gone is cancelled. So the Worker gives the model one try, a couple of seconds under the phone's wait,
// leaving room for the route's own reads and writes: a reply lands while the phone is still listening.

/** The phone's wait on each route before it shows the rule-written or typed path. */
export const PHONE_WAIT_MS: Record<"take" | "tell" | "label" | "describe", number> = { take: 10_000, tell: 20_000, label: 20_000, describe: 20_000 };

/** The Worker's one try at the model, per route. The probe has no phone waiting and takes the longer wait. */
export const MODEL_WAIT_MS: Record<"take" | "tell" | "label" | "describe" | "probe", number> = { take: 8_000, tell: 17_000, label: 17_000, describe: 17_000, probe: 17_000 };

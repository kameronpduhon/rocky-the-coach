import { env } from "cloudflare:workers";
import { createCookieSessionStorage } from "react-router";

// signedIn is the v1 cookie. authenticate() upgrades it to userId on Kameron's next request.
type SessionData = { userId: number; signedIn: true };

export const sessionStorage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "__rocky",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [env.SESSION_SECRET],
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 400,
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

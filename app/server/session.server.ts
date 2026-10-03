import { env } from "cloudflare:workers";
import { createCookieSessionStorage } from "react-router";

type SessionData = { signedIn: true };

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

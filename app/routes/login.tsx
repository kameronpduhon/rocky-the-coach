import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { clientIp } from "~/server/auth.server";
import { verifyPassword } from "~/server/password";
import { commitSession, getSession } from "~/server/session.server";
import { credentialsFor, isLockedOut, recordFailure } from "~/server/users.server";
import { btn } from "~/ui/button";

export function meta() {
  return [{ title: "Sign in · Rocky" }];
}

export async function action({ request }: Route.ActionArgs) {
  const ip = clientIp(request);
  if (await isLockedOut(ip)) {
    return data({ error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  }
  const form = await request.formData();
  const found = await credentialsFor(String(form.get("name") ?? ""));
  const ok = await verifyPassword(String(form.get("password") ?? ""), found?.passwordHash ?? null);
  if (!found || !ok) {
    await recordFailure(ip);
    return data({ error: "That name and password don't match." }, { status: 401 });
  }
  const session = await getSession(request.headers.get("Cookie"));
  session.unset("signedIn");
  session.set("userId", found.user.id);
  return redirect("/", { headers: { "Set-Cookie": await commitSession(session) } });
}

const FIELD = "h-[52px] rounded-[6px] border-[1.5px] border-border bg-field px-4 text-[17px] text-ink";

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-5 py-12">
      <h1 className="font-display text-[68px] uppercase leading-[0.92]">Rocky.</h1>
      <Form method="post" reloadDocument className="flex flex-col gap-3">
        <label htmlFor="name" className="text-[13px] font-semibold text-ink-3">
          Name
        </label>
        <input id="name" name="name" autoComplete="username" autoCapitalize="words" required className={FIELD} />
        <label htmlFor="password" className="mt-1 text-[13px] font-semibold text-ink-3">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={FIELD} />
        {actionData?.error && (
          <p role="alert" className="text-[15px] font-semibold text-ink-2">
            {actionData.error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${btn.primary} mt-2 h-14 disabled:opacity-60`}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </Form>
    </main>
  );
}

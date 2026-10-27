import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { clientIp } from "~/server/auth.server";
import { verifyPassword } from "~/server/password";
import { commitSession, getSession } from "~/server/session.server";
import { credentialsFor, isLockedOut, recordFailure } from "~/server/users.server";

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

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-[34px] font-bold">Rocky</h1>
      <p className="mt-1 text-label-2">Your plan, every day.</p>
      <Form method="post" reloadDocument className="mt-8 flex flex-col gap-3">
        <label htmlFor="name" className="text-[13px] font-semibold text-label-2">
          Name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="username"
          autoCapitalize="words"
          required
          className="h-[52px] rounded-[6px] bg-fill px-4 text-[17px] outline-none"
        />
        <label htmlFor="password" className="text-[13px] font-semibold text-label-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-[52px] rounded-[6px] bg-fill px-4 text-[17px] outline-none"
        />
        {actionData?.error && <p className="text-[15px] text-calories">{actionData.error}</p>}
        <button type="submit" disabled={busy} className="btn-prominent mt-2 h-[54px] rounded-full text-[17px] font-semibold">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </Form>
    </main>
  );
}

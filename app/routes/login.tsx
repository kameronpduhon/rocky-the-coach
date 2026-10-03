import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { clientIp, isLockedOut, passwordMatches, recordFailure } from "~/server/auth.server";
import { commitSession, getSession } from "~/server/session.server";

export function meta() {
  return [{ title: "Sign in · Rocky" }];
}

export async function action({ request }: Route.ActionArgs) {
  const ip = clientIp(request);
  if (await isLockedOut(ip)) {
    return data({ error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  }
  const form = await request.formData();
  if (!(await passwordMatches(String(form.get("password") ?? "")))) {
    await recordFailure(ip);
    return data({ error: "Wrong password." }, { status: 401 });
  }
  const session = await getSession(request.headers.get("Cookie"));
  session.set("signedIn", true);
  return redirect("/", { headers: { "Set-Cookie": await commitSession(session) } });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-[34px] font-bold">Rocky</h1>
      <p className="mt-1 text-label-2">Your plan, every day.</p>
      <Form method="post" reloadDocument className="mt-8 flex flex-col gap-3">
        <label htmlFor="password" className="text-[13px] font-semibold text-label-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-[52px] rounded-[14px] bg-fill px-4 text-[17px] outline-none"
        />
        {actionData?.error && <p className="text-[15px] text-calories">{actionData.error}</p>}
        <button type="submit" disabled={busy} className="btn-prominent mt-2 h-[54px] rounded-full text-[17px] font-semibold">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </Form>
    </main>
  );
}

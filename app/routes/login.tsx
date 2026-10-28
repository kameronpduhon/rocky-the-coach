import { useState } from "react";
import { APP_NAME, pageTitle } from "~/brand";
import { signIn } from "~/lib/sign-in";
import { btn } from "~/ui/button";

export function meta() {
  return [{ title: pageTitle("Sign in") }];
}

const FIELD = "h-[52px] rounded-[6px] border-[1.5px] border-border bg-field px-4 text-[17px] text-ink";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const problem = await signIn(String(form.get("name") ?? ""), String(form.get("password") ?? ""));
    if (problem === null) {
      // A full load, so the sync client starts for the person who just signed in.
      window.location.assign("/");
      return;
    }
    setError(problem);
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-5 py-12">
      <h1 className="font-display text-[68px] uppercase leading-[0.92]">{APP_NAME}.</h1>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="name" className="text-[13px] font-semibold text-ink-3">
          Name
        </label>
        <input id="name" name="name" autoComplete="username" autoCapitalize="words" required className={FIELD} />
        <label htmlFor="password" className="mt-1 text-[13px] font-semibold text-ink-3">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={FIELD} />
        {error && (
          <p role="alert" className="text-[15px] font-semibold text-ink-2">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${btn.primary} mt-2 h-14 disabled:opacity-60`}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

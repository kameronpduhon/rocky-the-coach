/** Signs in through the Worker, which sets the session cookie. Null means signed in; otherwise the line to show. */
export async function signIn(name: string, password: string, send: typeof fetch = fetch): Promise<string | null> {
  let res: Response;
  try {
    res = await send("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
  } catch {
    return "Signing in needs a signal.";
  }
  if (res.status === 204) return null;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "That didn't work. Try again.";
}

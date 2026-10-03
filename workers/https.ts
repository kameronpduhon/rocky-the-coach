const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Plain http requests lose the Secure session cookie, so the user looks signed out. Send them to https.
 * Local dev serves over http, so localhost is left alone.
 */
export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost")) return null;
  url.protocol = "https:";
  return Response.redirect(url.toString(), 301);
}

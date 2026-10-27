import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
// Latin subsets only. The service worker caches /assets/ on first use, so these work offline after one visit.
import "@fontsource/anton/latin-400.css";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import antonWoff2 from "@fontsource/anton/files/anton-latin-400-normal.woff2?url";
import barlowWoff2 from "@fontsource/barlow/files/barlow-latin-400-normal.woff2?url";
import numWoff2 from "@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2?url";
import { authenticate } from "~/server/auth.server";
import { runAsUser } from "~/server/current-user.server";

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    const auth = await authenticate(request);
    if (!auth) return next();
    const response = await runAsUser(auth.user, next);
    if (auth.setCookie) response.headers.append("Set-Cookie", auth.setCookie);
    return response;
  },
];

const preloadFont = (href: string) => ({ rel: "preload", href, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const });

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
  preloadFont(antonWoff2),
  preloadFont(barlowWoff2),
  preloadFont(numWoff2),
];

export function meta() {
  return [{ title: "Rocky" }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Rocky" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            // WebKit only applies :active press styles once a touchstart listener exists on the page.
            __html: `if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");document.addEventListener("touchstart",function(){},{passive:true});`,
          }}
        />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "Try again in a moment.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : "Error";
    details = error.status === 404 ? "That page does not exist." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="mx-auto max-w-md px-4 pt-24">
      <h1 className="text-3xl font-bold">{message}</h1>
      <p className="mt-2 text-label-2">{details}</p>
    </main>
  );
}

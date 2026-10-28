import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { APP_NAME } from "~/brand";
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
import barlowWoff2 from "@fontsource/barlow/files/barlow-latin-400-normal.woff2?url";
import numWoff2 from "@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2?url";
import { btn } from "~/ui/button";

const preloadFont = (href: string) => ({ rel: "preload", href, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const });

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
  preloadFont(barlowWoff2),
  preloadFont(numWoff2),
];

export function meta() {
  return [{ title: APP_NAME }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#f3eee4" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* "default" draws a dark clock. "black-translucent" drew it white, which vanishes on paper. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
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

/** What index.html shows until the scripts start: blank paper, like every screen's first paint. */
export function HydrateFallback() {
  return <main aria-busy="true" className="min-h-dvh" />;
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
      <p className="mt-2 text-ink-3">{details}</p>
      {/* A phone still on an older build can fail to load a screen after a deploy. A full load picks up the new one. */}
      <button type="button" onClick={() => window.location.reload()} className={`${btn.outline} mt-6 h-14 w-full text-[17px]`}>
        Reload
      </button>
    </main>
  );
}

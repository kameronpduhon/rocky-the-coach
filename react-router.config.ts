import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: the build writes one index.html that opens any path, and every screen reads the phone's copy. The
  // Worker answers /api/* and /media/* itself (workers/app.ts).
  ssr: false,
  // Ten routes is a tiny manifest. Shipping it with the page saves a /__manifest round trip before the first
  // visit to each screen.
  routeDiscovery: { mode: "initial" },
} satisfies Config;

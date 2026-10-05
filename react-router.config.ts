import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Ten routes is a tiny manifest. Shipping it with the page saves a /__manifest round trip before the first
  // visit to each screen.
  routeDiscovery: { mode: "initial" },
} satisfies Config;

// Optional on purpose: wrangler types only types the required secrets, and every AI path falls back to rules
// without it, so a deploy never waits on Kameron setting it.
declare namespace Cloudflare {
  interface Env {
    ANTHROPIC_API_KEY?: string;
  }
}

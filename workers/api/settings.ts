import { env } from "cloudflare:workers";
import { runBackup } from "~/server/backup.server";
import { serverNow } from "~/server/clock.server";
import { currentUser } from "~/server/current-user.server";
import { allUsers } from "~/server/users.server";

/** What only the server knows for Settings. Replaces the settings loader. */
export async function settings(request: Request): Promise<Response> {
  const user = currentUser();
  const other = (await allUsers()).find((u) => u.id !== user.id) ?? null;
  return Response.json(
    {
      otherName: other?.name ?? null,
      ingestUrl: `${new URL(request.url).origin}/api/ingest/steps`,
      // Kameron's Shortcut still sends the v1 INGEST_TOKEN until he switches it to his own token.
      ingestToken: user.ingestToken ?? (user.dbBinding === "DB" ? env.INGEST_TOKEN : null),
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function backup(): Promise<Response> {
  const user = currentUser();
  return Response.json({ backup: await runBackup(env[user.dbBinding], env.MEDIA, serverNow(), user.name.toLowerCase()) });
}

import { env } from "cloudflare:workers";
import { useEffect, useState } from "react";
import { Form, useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { Toggle } from "~/components/Toggle";
import { BackButton, Card, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { getDb } from "~/db/client";
import { DEFAULT_REMINDERS, REMINDER_LABEL, type ReminderKind } from "~/domain/reminders";
import { runBackup } from "~/server/backup.server";
import { serverNow } from "~/server/clock.server";
import { sendToAll } from "~/server/push.server";
import { reminderSettings, saveReminder } from "~/server/settings.server";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Settings · Rocky" }];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysLabel(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.length === 1) return days[0] === 0 ? "Sundays" : `${DAY_NAMES[days[0]]}s`;
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export async function loader({ request }: Route.LoaderArgs) {
  const reminders = await reminderSettings(getDb(env.DB));
  return {
    reminders: reminders.map((r) => ({ ...r, days: daysLabel(DEFAULT_REMINDERS.find((d) => d.kind === r.kind)!.days) })),
    ingestUrl: `${new URL(request.url).origin}/api/ingest/steps`,
    ingestToken: env.INGEST_TOKEN,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "test-push") {
    const pushed = await sendToAll(getDb(env.DB), { title: "Rocky", body: "Notifications are working.", url: "/settings", tag: "test" });
    return { pushed };
  }
  if (intent === "backup") {
    return { backup: await runBackup(env.DB, env.MEDIA, serverNow()) };
  }
  const kind = String(form.get("kind")) as ReminderKind;
  const time = String(form.get("time"));
  if (!DEFAULT_REMINDERS.some((r) => r.kind === kind) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "Bad reminder" };
  await saveReminder(getDb(env.DB), { kind, enabled: form.get("enabled") === "true", time });
  return { ok: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { reminders, ingestUrl, ingestToken, vapidPublicKey } = loaderData;
  const [shown, setShown] = useState(false);
  return (
    <Screen>
      <BackButton to="/" label="Back to Today" />
      <LargeTitle title="Settings" />

      <NotificationsSection vapidPublicKey={vapidPublicKey} />

      <section aria-label="Reminders" className="flex flex-col gap-2">
        <SectionTitle>Reminders</SectionTitle>
        <p className="px-1 text-[14px] leading-[1.4] text-label-2">Each one fires once a day, and only if it still applies. Times are Central.</p>
        <Card className="overflow-hidden">
          {reminders.map((r) => (
            <ReminderRow key={r.kind} kind={r.kind} enabled={r.enabled} time={r.time} days={r.days} />
          ))}
        </Card>
      </section>

      <section aria-label="Steps from Apple Watch" className="flex flex-col gap-2">
        <SectionTitle>Steps from Apple Watch</SectionTitle>
        <Card className="flex flex-col gap-4 p-[18px]">
          <p className="text-[15px] leading-[1.45] text-label-2">
            The "Send steps to Rocky" Shortcut posts today's step total to this address at noon, 3, 6, and 9pm. Paste both values into the Shortcut's Get Contents of URL action.
          </p>
          <div>
            <div className="text-[13px] font-semibold text-label-2">URL</div>
            <code className="mt-1 block break-all font-mono text-[14px]">{ingestUrl}</code>
            <div className="mt-3 flex gap-2">
              <CopyButton text={ingestUrl} label="Copy URL" />
            </div>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-label-2">Authorization header</div>
            <code className="mt-1 block break-all font-mono text-[14px]" aria-label={shown ? undefined : "Bearer token, hidden"}>
              Bearer {shown ? ingestToken : "••••••••••••••••"}
            </code>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShown(!shown)} className="btn-secondary h-11 rounded-full px-[18px] text-[15px] font-semibold">
              {shown ? "Hide" : "Show"}
            </button>
            <CopyButton text={`Bearer ${ingestToken}`} label="Copy header" />
          </div>
        </Card>
      </section>

      <BackupSection />

      <Card className="overflow-hidden">
        <Form method="post" action="/logout">
          {/* Neutral, not the calories pink the plan sketched: color is for data only. */}
          <button type="submit" className="flex h-[52px] w-full items-center justify-center text-[17px] font-semibold">
            Sign out
          </button>
        </Form>
      </Card>
    </Screen>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="btn-secondary h-11 rounded-full px-[18px] text-[15px] font-semibold"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function ReminderRow({ kind, enabled, time, days }: { kind: ReminderKind; enabled: boolean; time: string; days: string }) {
  const fetcher = useFetcher();
  const on = fetcher.formData ? fetcher.formData.get("enabled") === "true" : enabled;
  const at = fetcher.formData ? String(fetcher.formData.get("time")) : time;
  const save = (e: boolean, t: string) => fetcher.submit({ kind, enabled: String(e), time: t }, { method: "post" });
  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-separator py-2 pl-4 pr-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className={`text-[16px] font-medium ${on ? "" : "text-label-2"}`}>{REMINDER_LABEL[kind]}</div>
        <div className="text-[13px] text-label-2">{days}</div>
      </div>
      <label className="sr-only" htmlFor={`time-${kind}`}>
        {REMINDER_LABEL[kind]} time
      </label>
      <input
        id={`time-${kind}`}
        type="time"
        value={at}
        disabled={!on}
        onChange={(e) => e.target.value && save(on, e.target.value)}
        className="tabular h-11 w-[96px] flex-none rounded-[14px] bg-fill px-2 text-center text-[15px] font-semibold text-label outline-none disabled:text-label-on-fill [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <Toggle on={on} label={`${REMINDER_LABEL[kind]} reminder`} onChange={(next) => save(next, at)} />
    </div>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type PushState = "checking" | "install" | "unsupported" | "off" | "blocked" | "on";

function detectPush(): Exclude<PushState, "on" | "off" | "blocked"> | "ready" {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (supported) return "ready";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // iOS only exposes push to a web app opened from the Home Screen.
  return ios ? "install" : "unsupported";
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return res.ok;
}

function NotificationsSection({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const test = useFetcher<typeof action>();

  // Browser capability and permission only exist on the client, so the server renders the neutral state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = detectPush();
      if (found !== "ready") return !cancelled && setState(found);
      if (Notification.permission === "denied") return !cancelled && setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      if (sub && Notification.permission === "granted") {
        setState("on");
        // The server drops subscriptions the push service rejects; resaving keeps this device on the list.
        saveSubscription(sub).catch(() => {});
      } else setState("off");
    })().catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setNote("");
    setBusy(true);
    try {
      // iOS only shows the permission prompt when this runs straight from the tap, so it comes first.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      if (await saveSubscription(sub)) setState("on");
      else setNote("Could not save this device. Try again.");
    } catch {
      setNote("Could not turn on notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const pushed = test.data && "pushed" in test.data ? test.data.pushed : null;

  return (
    <section aria-label="Notifications" className="flex flex-col gap-2">
      <SectionTitle>Notifications</SectionTitle>
      <p className="px-1 text-[14px] leading-[1.4] text-label-2">Reminders arrive as notifications. Turn them on once on each device.</p>
      <Card className="flex flex-col gap-4 p-[18px]">
        {state === "install" ? (
          <>
            <p className="text-[15px] leading-[1.45] text-label-2">On iPhone, reminders need Rocky on the Home Screen.</p>
            <ol className="flex flex-col gap-2 text-[15px] leading-[1.4]">
              {["In Safari, tap Share.", "Tap Add to Home Screen.", "Open Rocky from the Home Screen and come back here."].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="tabular w-4 flex-none text-label-2">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-medium">This device</div>
              <div className="text-[13px] text-label-2" aria-live="polite">
                {state === "on" ? "On. Reminders arrive here." : state === "blocked" ? "Blocked" : state === "unsupported" ? "Not available in this browser" : state === "checking" ? "Checking" : "Off"}
              </div>
            </div>
            {state === "off" && (
              <button type="button" onClick={enable} disabled={busy} className="btn-prominent h-11 flex-none rounded-full px-[18px] text-[15px] font-semibold disabled:opacity-60">
                {busy ? "Turning on" : "Turn on"}
              </button>
            )}
            {state === "on" && (
              <test.Form method="post" className="flex-none">
                <input type="hidden" name="intent" value="test-push" />
                <button type="submit" disabled={test.state !== "idle"} className="btn-secondary h-11 rounded-full px-[18px] text-[15px] font-semibold">
                  {test.state !== "idle" ? "Sending" : "Send a test"}
                </button>
              </test.Form>
            )}
          </div>
        )}
        {state === "blocked" && (
          <p className="text-[15px] leading-[1.45] text-label-2">Notifications are blocked for Rocky. Turn them on in iPhone Settings, then Notifications, then Rocky.</p>
        )}
        {state === "unsupported" && <p className="text-[15px] leading-[1.45] text-label-2">Open Rocky from the Home Screen on your iPhone to get reminders.</p>}
        {note && (
          <p role="alert" className="text-[15px] leading-[1.45] text-label-2">
            {note}
          </p>
        )}
        {pushed !== null && (
          <p aria-live="polite" className="tabular text-[15px] leading-[1.45] text-label-2">
            {pushed === 0 ? "Nothing was sent. Check that Rocky is allowed in iPhone Settings, then Notifications, and try again." : `Sent to ${pushed} device${pushed === 1 ? "" : "s"}. It should arrive in a few seconds.`}
          </p>
        )}
      </Card>
    </section>
  );
}

function BackupSection() {
  const backup = useFetcher<typeof action>();
  const saved = backup.data && "backup" in backup.data ? backup.data.backup : null;
  return (
    <section aria-label="Backups" className="flex flex-col gap-2">
      <SectionTitle>Backups</SectionTitle>
      <Card className="flex flex-col gap-4 p-[18px]">
        <p className="text-[15px] leading-[1.45] text-label-2">Early every Sunday Rocky saves a copy of all your logs to storage and keeps the last 12.</p>
        <backup.Form method="post" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="intent" value="backup" />
          <button type="submit" disabled={backup.state !== "idle"} className="btn-secondary h-11 rounded-full px-[18px] text-[15px] font-semibold">
            {backup.state !== "idle" ? "Backing up" : "Back up now"}
          </button>
          {saved && (
            <span aria-live="polite" className="text-[15px] text-label-2">
              Saved <span className="tabular font-mono text-[14px]">{saved.replace(/^backups\//, "")}</span>
            </span>
          )}
        </backup.Form>
      </Card>
    </section>
  );
}

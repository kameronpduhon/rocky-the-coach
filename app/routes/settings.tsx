import { useEffect, useState, type ReactNode } from "react";
import { Form, Link } from "react-router";
import { APP_NAME, COACH_NAME, pageTitle } from "~/brand";
import type { Route } from "./+types/settings";
import { Toggle } from "~/components/Toggle";
import { Icon } from "~/components/ui";
import { useMe } from "~/me";
import { loadSettings } from "~/settings/load";
import { lastReceived, reminderRows, voiceOf, type ReminderRow } from "~/settings/model";
import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { SectionHead } from "~/ui/SectionHead";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Settings") }];
}

export async function clientLoader() {
  return { server: await loadSettings() };
}

export function HydrateFallback() {
  return <main aria-busy="true" className="min-h-dvh" />;
}

/** POSTs to a Worker endpoint. Null with no signal or a refusal. */
async function post<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { method: "POST" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { server } = loaderData;
  const me = useMe();
  const name = me?.name ?? "";
  const hasPlan = me?.hasPlan ?? false;
  const otherName = server?.otherName ?? null;
  // The address is this site's, so it shows offline. The component only renders in the browser: the
  // clientLoader has no server twin, so the server renders HydrateFallback.
  const ingestUrl = `${window.location.origin}/api/ingest/steps`;
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  useStoreVersion();
  const rows = (table: string) => (client && ready ? client.store.rows(table) : []);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-[26px] px-5 pb-12 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3.5">
        <Link to="/" aria-label="Back to Today" className="flex size-11 flex-none items-center justify-center rounded-[6px] border-[1.5px] border-border">
          <Icon name="back" size={18} strokeWidth={2.4} />
        </Link>
        <h1 className="font-display text-[48px] uppercase leading-none">Settings.</h1>
      </header>

      <div className="flex flex-col rounded-[6px] border-[1.5px] border-ink p-3.5">
        <span className="text-[17px] font-bold">Signed in as {name}</span>
        {otherName && <span className="text-[14px] leading-tight text-ink-3">{otherName}'s plan, logs and check-ins are kept separately.</span>}
      </div>

      <section aria-labelledby="rocky" className="flex flex-col gap-3.5">
        <SectionHead id="rocky">{COACH_NAME}</SectionHead>
        {ready && <VoicePicker voice={voiceOf(rows("profile"))} />}
      </section>

      <section aria-labelledby="reminders" className="flex flex-col">
        <div className="mb-1">
          <SectionHead id="reminders">Reminders</SectionHead>
        </div>
        {!hasPlan ? (
          <p className="pt-2 text-[15px] leading-[1.4] text-ink-2">Reminders start when your plan does.</p>
        ) : (
          ready && (
            <>
              {reminderRows(rows("reminder_settings")).map((r) => (
                <ReminderLine key={r.kind} r={r} />
              ))}
              <p className="mt-2.5 text-[14px] leading-[1.4] text-ink-3">Each one is skipped if it's already done. Times are Central.</p>
            </>
          )
        )}
      </section>

      <NotificationsSection vapidPublicKey={server?.vapidPublicKey ?? null} />

      <section aria-labelledby="steps" className="flex flex-col gap-2.5">
        <SectionHead id="steps">Steps from your iPhone</SectionHead>
        <p className="text-[15px] leading-[1.4] text-ink-2">
          An iPhone Shortcut sends your steps four times a day. {(ready && lastReceived(rows("steps_daily"), new Date())) || "Nothing received yet."}
        </p>
        <CopyField shown={ingestUrl.replace(/^https?:\/\//, "")} copy={ingestUrl} label="Copy the steps address" />
        {!server ? (
          <p className="text-[15px] text-ink-3">Needs a signal to show your token.</p>
        ) : server.ingestToken ? (
          <CopyField shown={`Token ••••••••••••${server.ingestToken.slice(-4)}`} copy={`Bearer ${server.ingestToken}`} label="Copy the Authorization header" />
        ) : (
          <p className="text-[15px] text-ink-3">No token yet.</p>
        )}
        <ShortcutSteps />
      </section>

      <BackupSection />

      <SyncLine />

      <Form method="post" action="/logout">
        <button type="submit" className={btn.quiet}>
          Sign out
        </button>
      </Form>
    </main>
  );
}

const VOICES = [
  { value: "corner", name: "In your corner", note: "Straight shooter, a little fight" },
  { value: "plain", name: "Plain", note: "Same advice, no boxing talk" },
] as const;

function VoicePicker({ voice }: { voice: "corner" | "plain" }) {
  const mutate = useMutate();
  return (
    <div className="flex flex-col gap-2">
      <span id="voice" className="text-[16px] font-bold">
        How {COACH_NAME} talks
      </span>
      <div role="radiogroup" aria-labelledby="voice" className="grid grid-cols-2 gap-2">
        {VOICES.map((v) => {
          const on = v.value === voice;
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => !on && void mutate("setVoice", { voice: v.value })}
              className={`min-h-16 rounded-[6px] px-2.5 py-2 text-left ${on ? "border-2 border-ink bg-ink text-paper" : "border-[1.5px] border-border text-ink"}`}
            >
              <span className="block font-num text-[16px] font-bold leading-tight">{v.name}</span>
              <span className={`block text-[13px] leading-tight ${on ? "text-on-ink-2" : "text-ink-3"}`}>{v.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReminderLine({ r }: { r: ReminderRow }) {
  const mutate = useMutate();
  const save = (enabled: boolean, time: string) => void mutate("setReminder", { kind: r.kind, enabled, time });
  return (
    <div className="flex min-h-[54px] items-center gap-3 border-b border-rule">
      <span className="flex flex-1 flex-col">
        <span className="text-[16px]">{r.label}</span>
        {r.days !== "Every day" && <span className="text-[13px] text-ink-3">{r.days}</span>}
      </span>
      <label className="sr-only" htmlFor={`time-${r.kind}`}>
        {r.label} time
      </label>
      <input
        id={`time-${r.kind}`}
        type="time"
        value={r.time}
        disabled={!r.enabled}
        onChange={(e) => e.target.value && save(r.enabled, e.target.value)}
        className="tabular h-11 w-[92px] flex-none bg-transparent text-right font-num text-[16px] font-bold text-ink disabled:text-ink-3 [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <Toggle on={r.enabled} label={`${r.label} reminder`} onChange={(next) => save(next, r.time)} />
    </div>
  );
}

function CopyField({ shown, copy, label }: { shown: string; copy: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-12 items-center gap-2.5 rounded-[6px] border-[1.5px] border-border bg-field pl-3">
      <span className="flex-1 truncate font-num text-[15px] font-semibold text-ink-2">{shown}</span>
      <button
        type="button"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(copy);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="h-11 flex-none px-3 text-[15px] font-bold underline underline-offset-[3px]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ShortcutSteps() {
  return (
    <details className="group">
      <summary className={`${btn.quiet} cursor-pointer list-none`}>How to set up the Shortcut</summary>
      <ol className="mt-2 flex flex-col gap-3 text-[15px] leading-[1.45] text-ink-2">
        <Step n={1}>
          New Shortcut named <span className="font-semibold text-ink">Send steps to Rocky</span>. Add Find Health Samples: Steps, Start Date is today, Group By Day. Leave Source unfiltered; Group By Day merges iPhone and Watch without double counting. Then Get Item from List (First Item), Get Details of Health Sample (Value), and Round Number.
        </Step>
        <Step n={2}>Add Date (Current Date), then Format Date with the custom format yyyy-MM-dd.</Step>
        <Step n={3}>
          Add Get Contents of URL. Method POST, the address above, a header named Authorization with the copied header value, and a JSON request body with <span className="font-mono text-[14px] text-ink">date</span> set to the formatted date and{" "}
          <span className="font-mono text-[14px] text-ink">steps</span> set to the rounded number.
        </Step>
        <Step n={4}>Run it once by hand. Steps on Today should match the Health app.</Step>
        <Step n={5}>In Automation, add a daily Time of Day automation at noon that runs Send steps to Rocky with Run Immediately on. Repeat for 3, 6, and 9 PM.</Step>
      </ol>
    </details>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="tabular w-4 flex-none font-num font-bold text-ink">
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function SyncLine() {
  const s = useSyncStatus();
  if (!s) return null;
  const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const text = !s.online
    ? `Sync: offline, ${s.waiting} change${s.waiting === 1 ? "" : "s"} waiting`
    : s.waiting
      ? `Sync: sending ${s.waiting} change${s.waiting === 1 ? "" : "s"}`
      : `Sync: up to date${when ? `, ${when}` : ""}`;
  return <p className="text-[13px] text-ink-3">{text}</p>;
}

function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  async function backUp() {
    setBusy(true);
    const reply = await post<{ backup: string }>("/api/backup");
    setBusy(false);
    setSaved(reply?.backup ?? null);
  }
  return (
    <section aria-labelledby="backups" className="flex flex-col gap-2.5">
      <SectionHead id="backups">Backups</SectionHead>
      <p className="text-[15px] leading-[1.4] text-ink-2">Early every Sunday {APP_NAME} saves a copy of all your logs and keeps the last 12.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={backUp} disabled={busy} className={`${btn.outlinePlain} h-11 px-4`}>
          {busy ? "Backing up" : "Back up now"}
        </button>
        {saved && (
          <span aria-live="polite" className="text-[15px] text-ink-3">
            Saved <span className="tabular font-mono text-[14px]">{saved.replace(/^backups\//, "")}</span>
          </span>
        )}
      </div>
    </section>
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

function NotificationsSection({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [pushed, setPushed] = useState<number | null>(null);

  async function sendTest() {
    setNote("");
    setSending(true);
    const reply = await post<{ pushed: number }>("/api/push/test");
    setSending(false);
    if (reply) setPushed(reply.pushed);
    else setNote("Could not send a test. Try again.");
  }

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
    // Checked before any await: iOS only shows the permission prompt straight from the tap.
    if (!vapidPublicKey) {
      setNote("Notifications need a signal to turn on.");
      return;
    }
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

  return (
    <section aria-labelledby="notifications" className="flex flex-col gap-2.5">
      <SectionHead id="notifications">Notifications</SectionHead>
      <p className="text-[14px] leading-[1.4] text-ink-2">Reminders arrive as notifications. Turn them on once on each device.</p>
      {state === "install" ? (
        <>
          <p className="text-[15px] leading-[1.45] text-ink-2">On iPhone, reminders need {APP_NAME} on the Home Screen.</p>
          <ol className="flex flex-col gap-2 text-[15px] leading-[1.4]">
            {["In Safari, tap Share.", "Tap Add to Home Screen.", `Open ${APP_NAME} from the Home Screen and come back here.`].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="tabular w-4 flex-none text-ink-2">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-medium">This device</div>
            <div className="text-[13px] text-ink-2" aria-live="polite">
              {state === "on" ? "On. Reminders arrive here." : state === "blocked" ? "Blocked" : state === "unsupported" ? "Not available in this browser" : state === "checking" ? "Checking" : "Off"}
            </div>
          </div>
          {state === "off" && (
            <button type="button" onClick={enable} disabled={busy} className={`${btn.primary} h-11 flex-none px-4 disabled:opacity-60`}>
              {busy ? "Turning on" : "Turn on"}
            </button>
          )}
          {state === "on" && (
            <button type="button" onClick={sendTest} disabled={sending} className={`${btn.outlinePlain} h-11 flex-none px-4`}>
              {sending ? "Sending" : "Send a test"}
            </button>
          )}
        </div>
      )}
      {state === "blocked" && (
        <p className="text-[15px] leading-[1.45] text-ink-2">Notifications are blocked for {APP_NAME}. Turn them on in iPhone Settings, then Notifications, then {APP_NAME}.</p>
      )}
      {state === "unsupported" && <p className="text-[15px] leading-[1.45] text-ink-2">Open {APP_NAME} from the Home Screen on your iPhone to get reminders.</p>}
      {note && (
        <p role="alert" className="text-[15px] leading-[1.45] text-ink-2">
          {note}
        </p>
      )}
      {pushed !== null && (
        <p aria-live="polite" className="tabular text-[15px] leading-[1.45] text-ink-2">
          {pushed === 0 ? `Nothing was sent. Check that ${APP_NAME} is allowed in iPhone Settings, then Notifications, and try again.` : `Sent to ${pushed} device${pushed === 1 ? "" : "s"}. It should arrive in a few seconds.`}
        </p>
      )}
    </section>
  );
}

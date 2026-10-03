import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { Toggle } from "~/components/Toggle";
import { BackButton, Card, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { getDb } from "~/db/client";
import { DEFAULT_REMINDERS, REMINDER_LABEL, type ReminderKind } from "~/domain/reminders";
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
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const kind = String(form.get("kind")) as ReminderKind;
  const time = String(form.get("time"));
  if (!DEFAULT_REMINDERS.some((r) => r.kind === kind) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "Bad reminder" };
  await saveReminder(getDb(env.DB), { kind, enabled: form.get("enabled") === "true", time });
  return { ok: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { reminders, ingestUrl, ingestToken } = loaderData;
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <Screen>
      <BackButton to="/" label="Back to Today" />
      <LargeTitle title="Settings" />

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
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`Bearer ${ingestToken}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn-secondary h-11 rounded-full px-[18px] text-[15px] font-semibold"
            >
              {copied ? "Copied" : "Copy header"}
            </button>
          </div>
        </Card>
      </section>

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

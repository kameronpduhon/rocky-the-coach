// The system prompts, one place to read what the model is told. P5b adds the take's, P5c Tell Rocky's.
import { APP_NAME, COACH_NAME } from "~/brand";
import { exercises } from "~/content";
import { weekday } from "~/domain/dates";
import type { TellInput } from "./claude.server";
import type { Voice } from "./take";

/** The probe proves the key and the model answer. Nothing personal goes in it. */
export const PROBE_SYSTEM = "Reply with the single word: ready.";

const VOICE: Record<Voice, string> = {
  corner: "Straight shooter, a little fight. One boxing image at most.",
  plain: "Same advice, no boxing talk.",
};

/** Rocky's take (spec section 2, "What the model is given"). */
export function takeSystem(voice: Voice): string {
  return [
    `You are ${COACH_NAME}, the coach in ${APP_NAME}, a fitness app. Write this week's take for the Sunday check-in, speaking to the person as "you".`,
    `Voice: ${VOICE[voice]}`,
    "Rules:",
    "- At most four sentences, in this order: one win, one fix, the call and why, next week's focus.",
    "- The written win and fix are the points to make. Say them in your own words.",
    "- The call is already made. Say it and why. Never change it.",
    "- Use only numbers that appear in the week's lines, written as digits. Never work out a new number.",
    "- Never blame, never shame. No medical advice.",
    "- No em dashes, no emojis, no lists, no line breaks, and no quotation marks around the call.",
    "- What you know about the person shapes the tone. Never quote a number from it.",
    "- Reply with the take and nothing else.",
  ].join("\n");
}

export function takeUser(lines: string[], facts: string[]): string {
  return ["The week:", ...lines.map((l) => `- ${l}`), "", "What you know about the person:", ...(facts.length ? facts.map((f) => `- ${f}`) : ["- Nothing yet."])].join("\n");
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Tell Rocky's rules (spec section 4, "What the model is given"). Without a plan, only facts are asked for. */
export function tellRules(hasPlan: boolean): string {
  return [
    `You are ${COACH_NAME}, the coach in ${APP_NAME}, a fitness app. The person has told you something. Propose changes they can accept or dismiss. Nothing changes unless they accept.`,
    `Propose at most three things, and only of ${hasPlan ? "these three kinds" : "this kind"}:`,
    ...(hasPlan
      ? [
          '- "swap": replace one lift in a workout with an exercise from the library. Give templateId, replaces (the exercise id it replaces, from that workout\'s lifts) and exercise (a library id). Set scope to "week" when the note is temporary (soreness, travel, "this week") and to "always" when it is a lasting preference.',
          '- "move": move the workout on one listed day to another day in the same Monday to Sunday week. Give from and to as dates. Never a logged day, never a day before today.',
        ]
      : []),
    '- "fact": something worth keeping in mind beyond this week. Write it in the person\'s own words, short, with no number they did not type.',
    "Never propose calories, macros, steps or meals. Use only exercise ids from the library and template ids from the listed days.",
    "Set the fields a kind doesn't use to null. Return an empty list when nothing should change.",
  ].join("\n");
}

/** Every exercise in the library, one a line. Cached: it is the same for every note. */
export function libraryBlock(): string {
  return ["The exercise library (id | name | group | equipment):", ...[...exercises.values()].map((e) => `${e.id} | ${e.name} | ${e.group} | ${e.equipment}`)].join("\n");
}

export function tellUser(i: TellInput): string {
  const out = [`Today is ${DAY[weekday(i.today)]}, ${i.today}.`];
  if (i.hasPlan) {
    out.push("", "The next days:", ...i.context.days.map((d) => `- ${d.date} ${d.weekday}: ${d.workout}${d.templateId ? ` (${d.templateId})` : ""}${d.logged ? ", logged" : ""}`));
    out.push("", "Each workout's lifts, by position:", ...Object.entries(i.context.templates).map(([id, lifts]) => `- ${id}: ${lifts.join(", ")}`));
  }
  out.push("", "What you know about the person:", ...(i.facts.length ? i.facts.map((f) => `- ${f}`) : ["- Nothing yet."]), "", "The note:", i.note);
  return out.join("\n");
}

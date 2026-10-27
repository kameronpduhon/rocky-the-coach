// npm run user -- set-password <name> [--remote]
// npm run user -- token <name> [--rotate] [--remote]
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { hashPassword } from "../app/server/password";

const USAGE = "Usage: npm run user -- set-password <name> [--remote] | token <name> [--rotate] [--remote]";
const [command, rawName = "", ...flags] = process.argv.slice(2);
const remote = flags.includes("--remote");
const nameKey = rawName.trim().toLowerCase();

// nameKey is the only user input that reaches SQL, and this keeps it to letters.
if (!["set-password", "token"].includes(command ?? "") || !/^[a-z]+$/.test(nameKey)) {
  console.error(USAGE);
  process.exit(1);
}

function d1<T>(sql: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "rocky-core", remote ? "--remote" : "--local", "--json", "--command", sql], {
    encoding: "utf8",
  });
  return (JSON.parse(out) as { results: T[] }[])[0]?.results ?? [];
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const rlWithOutput = rl as unknown as { _writeToOutput(s: string): void };
    const write = rlWithOutput._writeToOutput.bind(rl);
    // Echo the prompt but not the keystrokes.
    rlWithOutput._writeToOutput = (s) => {
      if (s.startsWith(question)) write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const where = `name_key = '${nameKey}'`;
const target = remote ? "production" : "local";
if (d1<{ id: number }>(`SELECT id FROM users WHERE ${where}`).length === 0) {
  console.error(`No user named ${rawName} in ${target}.`);
  process.exit(1);
}

if (command === "set-password") {
  const password = await askHidden("New password: ");
  const again = await askHidden("Again: ");
  if (password !== again) {
    console.error("The passwords don't match.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Use at least 8 characters.");
    process.exit(1);
  }
  d1(`UPDATE users SET password_hash = '${await hashPassword(password)}' WHERE ${where}`);
  console.log(`Password set for ${rawName} (${target}).`);
} else if (flags.includes("--rotate")) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  d1(`UPDATE users SET ingest_token = '${token}' WHERE ${where}`);
  console.log(token);
} else {
  const [row] = d1<{ token: string | null }>(`SELECT ingest_token AS token FROM users WHERE ${where}`);
  console.log(row?.token ?? "No token yet. Run again with --rotate to make one.");
}

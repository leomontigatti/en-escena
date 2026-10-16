import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import postgres from "postgres";

import {
  DEV_SEED_ACCOUNTS,
  DEV_SEED_PASSWORD,
} from "../app/lib/dev-seed/accounts";
import { git } from "./worktree-db";

// Gets a browser signed in on this worktree's dev server, so UI verification
// starts at the screen instead of at setup: starts `pnpm dev` when nothing
// answers on the worktree's port, runs `pnpm db:seed` on a database with no
// users (see `seedDecision`), signs in through `/ingresar` with `playwright-cli` in a
// session named for the role, and opens the path.
//
// Usage: pnpm ui:session <admin|academy|auditor|judge> <path>
//
// The session is left open for `playwright-cli -s=<role> …`, sized 1440×900
// as docs/agents/verification.md asks, and its login is saved to
// `.playwright-cli/<role>-state.json`. A dev server it started keeps running;
// `pnpm dev:stop` stops it.

type Role = keyof typeof DEV_SEED_ACCOUNTS;

const ROLES = Object.keys(DEV_SEED_ACCOUNTS) as Role[];
const SCRATCH = ".playwright-cli";
const DEV_TIMEOUT_MS = 120_000;
const SIGN_IN_ATTEMPTS = 3;
const USAGE = `usage: pnpm ui:session <${ROLES.join("|")}> <path>`;
const MISSING_CLI = [
  "playwright-cli is not on this shell's PATH.",
  "Install it with `npm i -g @playwright/cli` and `playwright-cli install-browser chromium`,",
  "or, when it is installed, see docs/agents/agent-configuration.md#the-agent-shells-path.",
  "Stop and tell the user: do not verify the UI with a harness's built-in browser instead.",
].join("\n");

function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

export function parseArgs(args: string[]): {
  role: Role;
  email: string;
  path: string;
} {
  const [role, appPath, ...rest] = args.filter((arg) => arg !== "--");

  if (!role || !appPath || rest.length > 0) throw new Error(USAGE);
  if (!isRole(role)) {
    throw new Error(
      `No seeded account for "${role}"; the roles are ${ROLES.join(", ")}.`,
    );
  }
  if (!appPath.startsWith("/")) {
    throw new Error(
      `"${appPath}" is not an app path: pass one starting with /, such as /admin.`,
    );
  }

  return { role, email: DEV_SEED_ACCOUNTS[role], path: appPath };
}

/**
 * The playwright-cli calls that open the login form (`open`), fill and send it
 * (`signIn`) and, once it has redirected, open the path and save the login
 * (`land`).
 */
export function loginCommands(input: {
  role: Role;
  email: string;
  password: string;
  origin: string;
  path: string;
}): { open: string[][]; signIn: string[][]; land: string[][] } {
  const session = `-s=${input.role}`;

  return {
    open: [
      [session, "open", `${input.origin}/ingresar`],
      [session, "resize", "1440", "900"],
    ],
    signIn: [
      [session, "fill", "input[name=identifier]", input.email],
      [session, "fill", "input[name=password]", input.password, "--submit"],
    ],
    land: [
      [session, "goto", `${input.origin}${input.path}`],
      [session, "state-save", `${SCRATCH}/${input.role}-state.json`],
    ],
  };
}

/**
 * The environment for the commands this script starts: its own, with the
 * worktree's `.env.local` on top. This script loaded `.env` before `ensure`
 * could write `.env.local`, and `--env-file` never overrides a variable that is
 * already set, so a child left to inherit would reach the main checkout's
 * database and port.
 */
export function worktreeEnv(
  base: NodeJS.ProcessEnv,
  envLocal: string | null,
): NodeJS.ProcessEnv {
  return envLocal === null ? { ...base } : { ...base, ...parseEnv(envLocal) };
}

/** Progress goes to stderr, so stdout is only the result. */
function step(message: string) {
  console.error(`ui:session: ${message}`);
}

function runQuiet(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${`${result.stdout}${result.stderr}`.trim()}`,
    );
  }

  return result.stdout;
}

function playwright(args: string[], cwd: string): string {
  return runQuiet("playwright-cli", args, cwd);
}

async function serving(origin: string): Promise<boolean> {
  try {
    await fetch(origin, { signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

async function startDev(root: string, origin: string, env: NodeJS.ProcessEnv) {
  mkdirSync(path.join(root, SCRATCH), { recursive: true });
  const logPath = path.join(SCRATCH, "dev.log");
  const log = openSync(path.join(root, logPath), "w");
  const dev = spawn("pnpm", ["dev"], {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", log, log],
  });
  let exited: number | null = null;

  dev.on("exit", (code) => {
    exited = code ?? 1;
  });
  dev.unref();
  step(`started pnpm dev (pid ${dev.pid}), log in ${logPath}`);

  const deadline = Date.now() + DEV_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`pnpm dev exited with ${exited}; see ${logPath}.`);
    }
    if (await serving(origin)) return;
    await delay(1_000);
  }

  throw new Error(
    `pnpm dev did not answer on ${origin} within ${DEV_TIMEOUT_MS / 1000} s; see ${logPath}.`,
  );
}

/**
 * Whether the role's demo account is there to sign in with, or the seed has
 * to create it. The seed resets more than its own rows (it deactivates every
 * other active event), so it runs only on a database with no users at all,
 * never on one holding other data, such as a copy refreshed from production.
 */
export function seedDecision(input: {
  email: string;
  accountExists: boolean;
  users: number;
}): "ready" | "seed" {
  if (input.accountExists) return "ready";
  if (input.users === 0) return "seed";

  throw new Error(
    `${input.email} is not in this database, which holds ${input.users} other users: it is not seeded demo data (a database refreshed from production?). Run pnpm db:seed yourself only if resetting it to demo data is what you want.`,
  );
}

async function readAccounts(databaseUrl: string, email: string) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    const [row] = await sql<{ users: number; accountExists: boolean }[]>`
      select
        (select count(*) from en_escena_user)::int as users,
        exists (select 1 from en_escena_user where email = ${email}) as "accountExists"`;
    return {
      users: row?.users ?? 0,
      accountExists: row?.accountExists ?? false,
    };
  } finally {
    await sql.end();
  }
}

/**
 * Sets up the worktree's database and dev server, as far as they are missing,
 * and returns the server's origin.
 */
async function prepareServer(root: string, email: string): Promise<string> {
  // `ensure` gives a worktree its own database and port on first use, and
  // seeds a database it creates.
  runQuiet(
    "node",
    [
      "--env-file-if-exists=.env",
      "--env-file-if-exists=.env.local",
      "--import",
      "tsx",
      "scripts/worktree-db.ts",
      "ensure",
    ],
    root,
  );

  const envLocalPath = path.join(root, ".env.local");
  const env = worktreeEnv(
    process.env,
    existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : null,
  );
  const origin = `http://localhost:${Number(env.PORT) || 5173}`;

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set; is .env linked?");
  }
  const accounts = await readAccounts(env.DATABASE_URL, email);

  if (seedDecision({ email, ...accounts }) === "seed") {
    step("the database has no users: running pnpm db:seed");
    runQuiet("pnpm", ["db:seed"], root, env);
  }

  if (await serving(origin)) {
    step(`dev server already up on ${origin}`);
  } else {
    await startDev(root, origin, env);
  }

  return origin;
}

/** The page's path, or null when it cannot be read, as mid-navigation. */
function currentPath(role: Role, root: string): string | null {
  const result = spawnSync(
    "playwright-cli",
    [`-s=${role}`, "eval", "location.pathname", "--raw"],
    { cwd: root, encoding: "utf8" },
  );

  if (result.status !== 0) return null;
  return result.stdout.trim().replace(/^"|"$/g, "");
}

function signedIn(role: Role, root: string): boolean {
  const pathname = currentPath(role, root);
  return pathname !== null && !pathname.startsWith("/ingresar");
}

/** Polls for up to ten seconds for the page to leave /ingresar. */
async function leftLogin(role: Role, root: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    await delay(500);
    if (signedIn(role, root)) return true;
  }

  return false;
}

// On a cold server Vite reloads the page once it has pre-bundled the
// dependencies, which can empty the form after it was filled; a sign-in that
// stays on /ingresar is tried again.
async function signIn(
  role: Role,
  commands: string[][],
  root: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= SIGN_IN_ATTEMPTS; attempt++) {
    // A slow sign-in may have landed after the last poll gave up on it.
    if (attempt > 1 && signedIn(role, root)) return true;
    for (const command of commands) playwright(command, root);
    if (await leftLogin(role, root)) return true;
  }

  return false;
}

async function main(args: string[]) {
  const { role, email, path: appPath } = parseArgs(args);

  if (spawnSync("playwright-cli", ["--version"]).status !== 0) {
    throw new Error(MISSING_CLI);
  }

  const root = git(["rev-parse", "--show-toplevel"]);
  const origin = await prepareServer(root, email);
  const commands = loginCommands({
    role,
    email,
    password: DEV_SEED_PASSWORD,
    origin,
    path: appPath,
  });

  // A session left from an earlier run may be signed in as someone else.
  spawnSync("playwright-cli", [`-s=${role}`, "close"], { cwd: root });
  for (const command of commands.open) playwright(command, root);

  if (!(await signIn(role, commands.signIn, root))) {
    throw new Error(
      `Signing in as ${email} did not leave /ingresar; \`playwright-cli -s=${role} snapshot\` shows the form's message.`,
    );
  }

  for (const command of commands.land) playwright(command, root);

  console.log(
    [
      `Signed in as ${email} in playwright-cli session "${role}" at ${origin}${appPath}.`,
      `Next: playwright-cli -s=${role} snapshot | screenshot --filename=${SCRATCH}/<what>.png`,
      `Done: playwright-cli -s=${role} close, then pnpm dev:stop.`,
    ].join("\n"),
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

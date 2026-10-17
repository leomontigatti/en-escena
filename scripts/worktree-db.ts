import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// A worktree's own database, storage folder and dev server port, so concurrent
// sessions stop re-seeding, refreshing and screenshotting each other's data. All
// three land in a gitignored `.env.local`, which `react-router dev` and the
// `db:*` scripts load over the `.env` symlinked from the main checkout.
//
// The storage folder lives outside the worktree, named like the database, so
// the two share a lifecycle: T3 removes a paused thread's worktree and recreates
// it on resume, and the database's rows must still find their files.
//
// `ensure` (run ahead of `pnpm dev`, `db:seed` and `db:migrate`) sets it up on
// first use, so a thread that never needs data never gets a database; with no
// argument (`pnpm db:worktree`) it re-runs the setup. `pnpm worktree:sweep`
// calls `prune` for the databases and storage folders of removed worktrees.
// Runbook: docs/local-auth.md, "One database per worktree".

const CONTAINER = "en-escena-postgres";
const PREFIX = "en-escena-wt-";
const PORT_MIN = 5200;
const PORT_SPAN = 800;
const ENV_LOCAL = ".env.local";

export function worktreeDatabaseName(worktreePath: string): string {
  const slug = path
    .basename(worktreePath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${PREFIX}${slug}`.slice(0, 63);
}

/** Where a worktree's uploaded files live: the data home, never the repo. */
export function worktreeStorageDir(
  database: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(storageRoot(env), database);
}

// A relative XDG_DATA_HOME is ignored, as the XDG spec asks: it would resolve
// under whichever checkout runs the script, and the sweep would miss it.
function storageRoot(env: NodeJS.ProcessEnv = process.env): string {
  const xdgDataHome = env.XDG_DATA_HOME?.trim();
  const dataHome =
    xdgDataHome && path.isAbsolute(xdgDataHome)
      ? xdgDataHome
      : path.join(env.HOME?.trim() || os.homedir(), ".local", "share");

  return path.join(dataHome, "en-escena", "worktrees");
}

export function databaseUrlFor(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

// A hash of the database name picks the starting port, so a worktree keeps its
// port across re-runs; a port another worktree's `.env.local` already claims is
// stepped past rather than shared.
export function choosePort(database: string, claimed: Set<number>): number {
  let hash = 2166136261;

  for (const char of database) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }

  for (let step = 0; step < PORT_SPAN; step++) {
    const port = PORT_MIN + ((hash + step) % PORT_SPAN);

    if (!claimed.has(port)) {
      return port;
    }
  }

  throw new Error(`Every port from ${PORT_MIN} is claimed by a worktree.`);
}

export function renderEnvLocal(input: {
  databaseUrl: string;
  port: number;
  storageDir: string;
}): string {
  const origin = `http://localhost:${input.port}`;

  return [
    "# Written by `pnpm db:worktree`: this worktree's own database, storage folder",
    "# and dev port, loaded over the shared .env. Rewritten on every run.",
    `DATABASE_URL="${input.databaseUrl}"`,
    `PORT="${input.port}"`,
    `APP_URL="${origin}"`,
    `BETTER_AUTH_URL="${origin}"`,
    storageLine(input.storageDir),
    "",
  ].join("\n");
}

function storageLine(storageDir: string): string {
  return `STORAGE_VOLUME_DIR="${storageDir}"`;
}

/**
 * A `.env.local` written before worktrees had their own storage folder, with
 * the line added; undefined when it already sets one.
 */
export function withStorageDir(
  content: string,
  storageDir: string,
): string | undefined {
  if (/^STORAGE_VOLUME_DIR=/m.test(content)) return undefined;

  const separator = content === "" || content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}${storageLine(storageDir)}\n`;
}

export function parseEnvPort(content: string): number | undefined {
  const match = /^PORT="?(\d+)"?$/m.exec(content);
  return match ? Number(match[1]) : undefined;
}

/**
 * The worktree databases and storage folders, by name, whose worktree is gone.
 * With `accepted`, only those the accepted dry run listed: one orphaned since
 * waits for the next report.
 */
export function planPrune(input: {
  databases: string[];
  storageDirs: string[];
  worktreePaths: string[];
  accepted?: ReadonlySet<string>;
}): string[] {
  const live = new Set(input.worktreePaths.map(worktreeDatabaseName));
  const names = [...new Set([...input.databases, ...input.storageDirs])];

  return names.filter(
    (name) =>
      name.startsWith(PREFIX) &&
      !live.has(name) &&
      (!input.accepted || input.accepted.has(name)),
  );
}

export function git(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function worktreePaths(): string[] {
  return git(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

export function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);

  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args[0]} exited with ${result.status}`);
  }
}

function isMainCheckout(root: string): boolean {
  return (
    path.resolve(root, git(["rev-parse", "--git-dir"])) ===
    path.resolve(root, git(["rev-parse", "--git-common-dir"]))
  );
}

function ensure() {
  const root = git(["rev-parse", "--show-toplevel"]);

  if (isMainCheckout(root)) return;

  const envLocalPath = path.join(root, ENV_LOCAL);

  if (!existsSync(envLocalPath)) {
    console.log("First use of the database here: setting up this worktree's.");
    setUp(root);
    return;
  }

  const storageDir = worktreeStorageDir(worktreeDatabaseName(root));
  const upgraded = withStorageDir(
    readFileSync(envLocalPath, "utf8"),
    storageDir,
  );

  if (upgraded === undefined) return;

  writeFileSync(envLocalPath, upgraded);
  console.log(`This worktree's uploads now go to ${storageDir}.`);

  // Until now the worktree uploaded to the folder `.env` names, so its rows
  // point there: copy it over, never move it, since other checkouts read it too.
  const sharedDir = process.env.STORAGE_VOLUME_DIR;
  const from = sharedDir ? path.resolve(root, sharedDir) : undefined;

  if (from && existsSync(from) && !isWithin(storageDir, from)) {
    cpSync(from, storageDir, { recursive: true, force: false });
    console.log(`Copied the files its rows point at from ${from}.`);
  }
}

/** Whether `target` is `folder` or inside it. */
export function isWithin(target: string, folder: string): boolean {
  const relative = path.relative(folder, target);

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pickPort(root: string, envLocalPath: string, database: string) {
  const ownPort = existsSync(envLocalPath)
    ? parseEnvPort(readFileSync(envLocalPath, "utf8"))
    : undefined;
  const claimed = new Set(
    worktreePaths()
      .filter((worktree) => path.resolve(worktree) !== path.resolve(root))
      .map((worktree) => path.join(worktree, ENV_LOCAL))
      .filter((file) => existsSync(file))
      .map((file) => parseEnvPort(readFileSync(file, "utf8")))
      .filter((port): port is number => port !== undefined),
  );

  return ownPort !== undefined && !claimed.has(ownPort)
    ? ownPort
    : choosePort(database, claimed);
}

function migrateAndSeed(options: {
  envLocalPath: string;
  databaseUrl: string;
  port: number;
  database: string;
  created: boolean;
}) {
  const { envLocalPath, databaseUrl, port, database, created } = options;
  const hadEnvLocal = existsSync(envLocalPath);
  const storageDir = worktreeStorageDir(database);

  writeFileSync(
    envLocalPath,
    renderEnvLocal({ databaseUrl, port, storageDir }),
  );

  const env = { DATABASE_URL: databaseUrl, STORAGE_VOLUME_DIR: storageDir };

  try {
    run("pnpm", ["db:migrate"], env);

    // Only a new database is seeded: re-running the command must not wipe what
    // the session built on the demo data since.
    if (created) {
      run("pnpm", ["db:seed"], env);
    }
  } catch (error) {
    // A half-set-up worktree must not look set up: `ensure` skips a worktree
    // that has `.env.local`, so leave nothing behind for the next run to trust.
    if (!hadEnvLocal) rmSync(envLocalPath, { force: true });
    if (created) {
      // The seed's uploads belong to the database it is about to drop; a
      // folder that will not go must not keep the database from going too.
      try {
        rmSync(storageDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(
          `Could not remove ${storageDir}: ${String(cleanupError)}`,
        );
      }
      try {
        run("docker", [
          "exec",
          CONTAINER,
          "dropdb",
          "-U",
          "postgres",
          database,
        ]);
      } catch (cleanupError) {
        console.error(`Could not drop ${database}: ${String(cleanupError)}`);
      }
    }
    throw error;
  }
}

function setUp(root: string) {
  if (isMainCheckout(root)) {
    console.log("This is the main checkout; it keeps the en-escena database.");
    return;
  }

  const baseUrl = process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error("DATABASE_URL is required; is .env linked?");
  }

  const database = worktreeDatabaseName(root);
  const databaseUrl = databaseUrlFor(baseUrl, database);
  const envLocalPath = path.join(root, ENV_LOCAL);
  const port = pickPort(root, envLocalPath, database);

  run("docker", ["compose", "up", "-d", "--wait", "postgres"]);

  const created =
    psql(`select 1 from pg_database where datname = '${database}'`) !== "1";

  if (created) {
    run("docker", ["exec", CONTAINER, "createdb", "-U", "postgres", database]);
  }

  migrateAndSeed({ envLocalPath, databaseUrl, port, database, created });

  console.log(`\nDatabase: ${database}`);
  console.log(`Storage:  ${worktreeStorageDir(database)}`);
  console.log(`Dev server: http://localhost:${port} (pnpm dev)`);
}

/**
 * Returns the worktree names whose database and storage folder it dropped, or
 * would drop on a dry run.
 */
export function prune(
  dryRun: boolean,
  livePaths = worktreePaths(),
  accepted?: ReadonlySet<string>,
): string[] {
  const databases = new Set(
    psql("select datname from pg_database").split("\n"),
  );
  const root = storageRoot();
  const storageDirs = new Set(
    existsSync(root)
      ? readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      : [],
  );
  const drop = planPrune({
    databases: [...databases],
    storageDirs: [...storageDirs],
    worktreePaths: livePaths,
    accepted,
  });

  if (drop.length === 0) {
    console.log("No database or storage folder belongs to a removed worktree.");
    return drop;
  }

  for (const name of drop) {
    const pieces = [
      databases.has(name) ? "database" : undefined,
      storageDirs.has(name) ? "storage folder" : undefined,
    ].filter(Boolean);
    console.log(
      `${dryRun ? "Would drop" : "Dropping"} ${name} (${pieces.join(" and ")})`,
    );

    if (dryRun) continue;

    if (databases.has(name)) {
      psql(
        `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${name}'`,
      );
      run("docker", ["exec", CONTAINER, "dropdb", "-U", "postgres", name]);
    }
    if (storageDirs.has(name)) {
      rmSync(path.join(root, name), { recursive: true, force: true });
    }
  }

  return drop;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  try {
    if (process.argv.includes("ensure")) {
      ensure();
    } else {
      setUp(git(["rev-parse", "--show-toplevel"]));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

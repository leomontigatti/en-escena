import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { git } from "./worktree-db";

// Prints what an agent needs to work in this worktree without reading `.env`,
// which agents are denied: the setup state, the dev port, the database and a
// psql line for it, and which tools the agent's shell can reach. It prints no
// secret: of `DATABASE_URL` only the database name leaves this script.
//
// Usage: pnpm dev:info. Always exits 0; a missing piece is a line, not an error.

const CONTAINER = "en-escena-postgres";
const DEFAULT_PORT = 5173;

type Check = { name: string; ok: boolean; detail: string };

export function databaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) || null;
  } catch {
    return null;
  }
}

export function renderInfo(input: {
  root: string;
  branch: string;
  setup: Check[];
  port: number;
  database: string | null;
  tools: Check[];
}): string {
  const mark = (check: Check) =>
    `  ${check.ok ? "ok     " : "MISSING"} ${check.name}${check.detail ? `: ${check.detail}` : ""}`;

  return [
    `Worktree: ${input.root}`,
    `Branch:   ${input.branch}`,
    "",
    "Setup:",
    ...input.setup.map(mark),
    "",
    `Dev port: ${input.port} (http://localhost:${input.port})`,
    `Database: ${input.database ?? "none: DATABASE_URL is not set; is .env linked?"}`,
    ...(input.database
      ? [
          `psql:     docker exec -it ${CONTAINER} psql -U postgres -d ${input.database}`,
          "          Tables are prefixed `en_escena_` (en_escena_choreography); `\\dt en_escena_*` lists them.",
        ]
      : []),
    "",
    "Tools on this shell's PATH:",
    ...input.tools.map(mark),
  ].join("\n");
}

/** The first line the command prints, or null when it fails or is missing. */
function probe(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
  if (result.error || result.status !== 0) return null;
  return (
    `${result.stdout}\n${result.stderr}`
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? ""
  );
}

function tool(name: string, args: string[], label = name): Check {
  const output = probe(name, args);
  return { name: label, ok: output !== null, detail: output ?? "" };
}

function main() {
  const root = git(["rev-parse", "--show-toplevel"]);
  const at = (file: string) => path.join(root, file);
  const envLinked = existsSync(at(".env"));

  const setup: Check[] = [
    {
      name: ".env",
      ok: envLinked,
      detail: envLinked
        ? lstatSync(at(".env")).isSymbolicLink()
          ? "linked from the main checkout"
          : "present"
        : "missing: t3.json was never imported",
    },
    {
      name: "node_modules",
      ok: existsSync(at("node_modules")),
      detail: "",
    },
    {
      name: "route types",
      ok: existsSync(at(".react-router")),
      detail: "",
    },
    {
      name: ".env.local",
      ok: existsSync(at(".env.local")),
      detail: existsSync(at(".env.local"))
        ? "worktree database and port set up"
        : "not yet: the first pnpm dev, db:seed or db:migrate sets it up",
    },
  ];

  const docker = probe("docker", ["info", "--format", "{{.ServerVersion}}"]);
  const container = probe("docker", [
    "inspect",
    "-f",
    "{{.State.Status}}",
    CONTAINER,
  ]);
  const codexLogin = probe("codex", ["login", "status"]);

  const tools: Check[] = [
    tool("node", ["--version"]),
    tool("pnpm", ["--version"]),
    {
      name: "codex",
      ok: codexLogin !== null,
      detail:
        codexLogin ??
        (probe("codex", ["--version"]) === null
          ? "not installed"
          : "not logged in: run `codex login`"),
    },
    tool("playwright-cli", ["--version"]),
    tool("gitleaks", ["version"]),
    {
      name: "docker",
      ok: docker !== null,
      detail:
        docker === null
          ? "daemon unreachable"
          : `server ${docker}; ${CONTAINER} ${container ?? "not created"}`,
    },
  ];

  console.log(
    renderInfo({
      root,
      branch: git(["branch", "--show-current"]),
      setup,
      port: Number(process.env.PORT) || DEFAULT_PORT,
      database: databaseName(process.env.DATABASE_URL),
      tools,
    }),
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main();
}

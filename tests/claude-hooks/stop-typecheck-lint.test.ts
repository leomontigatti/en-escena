import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// #982: the blocking `Stop` gate. A turn may not end on a red typecheck, but the
// gate costs ~6 s, so it has to stay off the paths where it buys nothing: a
// docs-only session, the AFK reviewer (which authors no app code and cannot fix
// what it would report), and the documented local bypass.
//
// `pnpm` is stubbed on `PATH` so these assertions are about the hook's decisions,
// not about the real compiler.

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const hook = path.join(repoRoot, ".claude/hooks/stop-typecheck-lint.sh");

let workdir: string;
let projectDir: string;
let binDir: string;
let pnpmLog: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "stop-hook-"));
  projectDir = path.join(workdir, "project");
  binDir = path.join(workdir, "bin");
  pnpmLog = path.join(workdir, "pnpm.log");
  mkdirSync(projectDir);
  mkdirSync(binDir);
  spawnSync("git", ["init", "--quiet", projectDir]);

  // Stub `pnpm`: records every invocation, and fails `typecheck` on demand.
  const stub = path.join(binDir, "pnpm");
  writeFileSync(
    stub,
    [
      "#!/bin/sh",
      `echo "$@" >> "${pnpmLog}"`,
      'if [ "$1" = "typecheck" ] && [ -n "${FAKE_TYPECHECK_FAILS:-}" ]; then',
      "  echo \"app/routes/home.tsx(3,7): error TS2322: Type 'number' is not assignable to type 'string'.\"",
      "  exit 1",
      "fi",
      'if [ "$1" = "lint" ] && [ -n "${FAKE_LINT_FAILS:-}" ]; then',
      '  echo "app/hooks/use-thing.ts:12:5 eslint(react-hooks/exhaustive-deps)" >&2',
      "  exit 1",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(stub, 0o755);
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function change(relativePath: string, contents = "x\n") {
  const full = path.join(projectDir, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function runHook({
  stopHookActive = false,
  env = {},
}: { stopHookActive?: boolean; env?: Record<string, string> } = {}) {
  return spawnSync("bash", [hook], {
    input: JSON.stringify({
      hook_event_name: "Stop",
      stop_hook_active: stopHookActive,
    }),
    encoding: "utf8",
    cwd: projectDir,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CLAUDE_PROJECT_DIR: projectDir,
      SKIP_STOP_CHECKS: "",
      GITHUB_WORKFLOW: "",
      ...env,
    },
  });
}

/** What the stubbed `pnpm` was asked to run, in order. */
function pnpmCalls(): string[] {
  if (!existsSync(pnpmLog)) return [];
  return readFileSync(pnpmLog, "utf8").trim().split("\n").filter(Boolean);
}

describe("stop-typecheck-lint.sh", () => {
  it("blocks with exit 2 and the failing tsc output when typecheck is red", () => {
    change("app/routes/home.tsx");

    const result = runHook({ env: { FAKE_TYPECHECK_FAILS: "1" } });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error TS2322");
    expect(result.stderr).toContain("Fix this before ending the turn.");
    expect(pnpmCalls()).toEqual(["typecheck"]);
  });

  it("switches to the blocked-report wording once it is already blocking", () => {
    change("app/routes/home.tsx");

    const result = runHook({
      stopHookActive: true,
      env: { FAKE_TYPECHECK_FAILS: "1" },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "If you cannot fix this, say so explicitly and report the work as blocked.",
    );
    expect(result.stderr).not.toContain("Fix this before ending the turn.");
  });

  it("blocks on a red lint even when typecheck is green", () => {
    change("app/hooks/use-thing.ts");

    const result = runHook({ env: { FAKE_LINT_FAILS: "1" } });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("react-hooks/exhaustive-deps");
    expect(pnpmCalls()).toEqual(["typecheck", "lint"]);
  });

  it("ends the turn when both are green", () => {
    change("app/routes/home.tsx");

    const result = runHook();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(pnpmCalls()).toEqual(["typecheck", "lint"]);
  });

  it("does not run anything for a session that changed only .md files", () => {
    change("docs/agents/workflows.md");

    const result = runHook({ env: { FAKE_TYPECHECK_FAILS: "1" } });

    expect(result.status).toBe(0);
    expect(pnpmCalls()).toEqual([]);
  });

  // One `it` per path, because a single test that writes several leaves the
  // earlier ones on disk while it asserts the next: every arm but the first
  // would ride on them and never be exercised. `scripts/x.mjs` and
  // `.oxlintrc.json` are the lint half of the filter (#1014) — the gate runs
  // `pnpm lint`, so the filter has to cover what oxlint reads.
  it.each([
    "tsconfig.json",
    "package.json",
    ".oxlintrc.json",
    "scripts/x.mjs",
    "scripts/x.cjs",
    "app/legacy.js",
    "app/legacy.jsx",
  ])("runs for a change to %s alone", (changedPath) => {
    change(changedPath, "{}\n");

    expect(runHook().status).toBe(0);
    expect(pnpmCalls()).toEqual(["typecheck", "lint"]);
  });

  it("sees a tracked and modified file, not only untracked ones", () => {
    change("app/routes/home.tsx", "export const home = 1;\n");
    spawnSync("git", ["add", "."], { cwd: projectDir });
    spawnSync(
      "git",
      [
        "-c",
        "user.email=a@b.c",
        "-c",
        "user.name=a",
        "commit",
        "--quiet",
        "-m",
        "seed",
      ],
      {
        cwd: projectDir,
      },
    );
    expect(runHook().status).toBe(0);
    expect(pnpmCalls()).toEqual([]);

    change("app/routes/home.tsx", "export const home = 2;\n");

    expect(runHook({ env: { FAKE_TYPECHECK_FAILS: "1" } }).status).toBe(2);
    expect(pnpmCalls()).toEqual(["typecheck"]);
  });

  it("honours SKIP_STOP_CHECKS as the documented local bypass", () => {
    change("app/routes/home.tsx");

    const result = runHook({
      env: { SKIP_STOP_CHECKS: "1", FAKE_TYPECHECK_FAILS: "1" },
    });

    expect(result.status).toBe(0);
    expect(pnpmCalls()).toEqual([]);
  });

  it("skips every GitHub workflow, since none authors app code (ADR-0016)", () => {
    change("app/routes/home.tsx");

    for (const workflow of ["AFK Update Branch", "AFK To Issues", "CI"]) {
      const result = runHook({
        env: { GITHUB_WORKFLOW: workflow, FAKE_TYPECHECK_FAILS: "1" },
      });
      expect(result.status, workflow).toBe(0);
    }
    expect(pnpmCalls()).toEqual([]);
  });
});

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Coverage for #1029. `scripts/afk-add-label.sh` is the one implementation of
// the PAT-or-fallback label add (§3.4) that every AFK call site now invokes;
// before this it shipped in four inline copies held together by a drift
// assertion. The cases below run the shipped script with a stub `gh` on PATH —
// its behaviour is what the call sites depend on, and a copy of the script here
// could drift away from what ships and still be green.

const script = fileURLToPath(
  new URL("../../scripts/afk-add-label.sh", import.meta.url),
);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "afk-add-label-"));

  // Stub `gh`: records every invocation with the token it was handed, and can
  // be told to refuse the write for one specific token.
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    [
      "#!/usr/bin/env bash",
      "set -uo pipefail",
      'printf "%s|%s\\n" "${GH_TOKEN:-}" "$*" >> "$GH_STUB_LOG"',
      "for rejected in ${GH_STUB_REJECT_TOKENS:-}; do",
      '  [ "${GH_TOKEN:-}" = "$rejected" ] || continue',
      '  echo "gh: Resource not accessible by integration (HTTP 403)" >&2',
      "  exit 1",
      "done",
      "exit 0",
    ].join("\n"),
  );
  chmodSync(gh, 0o755);
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

interface RunResult {
  stdout: string;
  status: number;
  /** Every `gh` invocation, as `<token>|<argv>`. */
  calls: string[];
  /** The tokens the label add was attempted with, in order. */
  tokens: string[];
}

function addLabel(options: {
  agentPat?: string;
  rejectTokens?: string[];
}): RunResult {
  const log = join(dir, "gh.log");
  writeFileSync(log, "");

  const run = spawnSync(
    "bash",
    [script, "11", "agent:implement", "Implement", "it will not start."],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        GH_STUB_LOG: log,
        GH_STUB_REJECT_TOKENS: (options.rejectTokens ?? []).join(" "),
        GITHUB_TOKEN: "github-token",
        AGENT_PAT: options.agentPat ?? "",
        GH_REPO: "leomontigatti/en-escena",
      },
    },
  );

  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);

  return {
    stdout: run.stdout,
    status: run.status ?? -1,
    calls,
    tokens: calls
      .filter((call) =>
        call.endsWith(
          "api -X POST repos/leomontigatti/en-escena/issues/11/labels -f labels[]=agent:implement",
        ),
      )
      .map((call) => call.split("|")[0]),
  };
}

describe("the PAT-or-fallback label add (#1029)", () => {
  it("labels with AGENT_PAT, the only token that wakes the next workflow", () => {
    const result = addLabel({ agentPat: "the-pat" });

    expect(result.tokens).toEqual(["the-pat"]);
    expect(result.status).toBe(0);
    // The caller owns the success wording; a silent happy path is what lets it.
    expect(result.stdout).toBe("");
  });

  it("falls back to github.token when there is no PAT", () => {
    const result = addLabel({});

    expect(result.tokens).toEqual(["github-token"]);
    expect(result.status).toBe(0);
  });

  it("falls back to github.token when the PAT is refused", () => {
    const result = addLabel({ agentPat: "the-pat", rejectTokens: ["the-pat"] });

    expect(result.tokens).toEqual(["the-pat", "github-token"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("AGENT_PAT label add failed for #11");
    expect(result.stdout).not.toContain("::error::");
  });

  it("names the item and fails when both tokens refuse", () => {
    // The hole #1027 was filed for: the fallback ran under `set +e`, its exit
    // status was dropped on the floor, and the step reported success anyway.
    const result = addLabel({
      agentPat: "the-pat",
      rejectTokens: ["the-pat", "github-token"],
    });

    expect(result.tokens).toEqual(["the-pat", "github-token"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "::error::Could not label #11 agent:implement; it will not start.",
    );
  });

  it("survives an unset AGENT_PAT under set -u", () => {
    const log = join(dir, "gh.log");
    writeFileSync(log, "");
    // Not an empty string — genuinely absent, which is what `set -u` trips on.
    const env: NodeJS.ProcessEnv = { ...process.env, GH_STUB_LOG: log };
    delete env.AGENT_PAT;

    const run = spawnSync(
      "bash",
      [script, "11", "agent:implement", "Implement", "it will not start."],
      {
        encoding: "utf8",
        env: {
          ...env,
          PATH: `${dir}:${process.env.PATH ?? ""}`,
          GITHUB_TOKEN: "github-token",
          GH_REPO: "leomontigatti/en-escena",
        },
      },
    );

    expect(run.status, `stderr: ${run.stderr}`).toBe(0);
  });

  it("hands each gh call exactly one token (#956)", () => {
    const result = addLabel({ agentPat: "the-pat", rejectTokens: ["the-pat"] });

    for (const call of result.calls) {
      expect(call.split("|")[0], `untokened gh call: ${call}`).not.toBe("");
    }
  });
});

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

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stepRunBody } from "./pr-workflows.test-support";

// Coverage for #1027. The promote step flips an unblocked `agent:queued` issue to
// `agent:implement` (§4.7), and it does so with the PAT-or-fallback pair: only
// `AGENT_PAT` re-triggers Implement, `github.token` merely lands the label. The
// step removes `agent:queued` *before* adding `agent:implement`, so a refused add
// leaves the issue carrying neither label — which the state machine reads as
// fresh work, hitting the same refusal on every later trigger.
//
// As in `behind-pr-labelling.test.ts` and `failure-reason-fallback.test.ts`, the
// cases below run the *shipped* bash lifted out of the workflow file, with a stub
// `gh` on PATH: a copy of the script here could drift away from what ships and
// still be green. Since #1029 the add itself is `scripts/afk-add-label.sh`, which
// the step invokes and which these cases therefore exercise too — the unit's own
// cases live in `add-label.test.ts`; what is asserted here is how the *loop*
// treats a refusal.

const WORKFLOW = ".github/workflows/agent-promote-queued.yml";

const script = stepRunBody(WORKFLOW, "Promote unblocked dependents");

const CLOSED_NUMBER = 500;

interface Dependent {
  number: number;
  labels?: string[];
  parent?: number;
  /** Numbers of blockers that are still open besides the closed one. */
  openBlockers?: number;
  /** What the re-fetch just before the flip sees; defaults to still queued. */
  stillQueued?: boolean;
}

function infoJson(dep: Dependent): string {
  const { labels = ["agent:queued"], parent, openBlockers = 0 } = dep;
  return JSON.stringify({
    data: {
      repository: {
        issue: {
          labels: { nodes: labels.map((name) => ({ name })) },
          parent: parent === undefined ? null : { number: parent },
          blockedBy: {
            nodes: Array.from({ length: openBlockers }, (_, i) => ({
              number: 900 + i,
              state: "OPEN",
            })),
          },
        },
      },
    },
  });
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "afk-promote-queued-"));

  // Stub `gh`: answers the two GraphQL queries from fixture files (told apart by
  // the issue number they ask about), answers the re-fetch that guards the flip,
  // records every invocation with the token it was handed, and can be told to
  // refuse the promotion write for one token or for one issue.
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    [
      "#!/usr/bin/env bash",
      "set -uo pipefail",
      'printf "%s|%s\\n" "${GH_TOKEN:-}" "$*" >> "$GH_STUB_LOG"',
      'if [ "${1:-}" = "api" ] && [ "${2:-}" = "graphql" ]; then',
      '  num=""',
      '  for arg in "$@"; do',
      '    case "$arg" in num=*) num="${arg#num=}" ;; esac',
      "  done",
      // The blocking query asks about the closed issue; the per-dependent one
      // asks about a dependent. Same subcommand, different fixture.
      '  if [ "$num" = "$CLOSED_NUMBER" ]; then',
      '    cat "$GH_STUB_DIR/deps.txt"',
      "  else",
      '    cat "$GH_STUB_DIR/info-$num.json"',
      "  fi",
      "  exit 0",
      "fi",
      'if [ "${1:-}" = "issue" ] && [ "${2:-}" = "view" ]; then',
      '  cat "$GH_STUB_DIR/view-${3}.txt"',
      "  exit 0",
      "fi",
      // Only the promotion write can be refused: the `agent:queued` removal and
      // the comment that precede it are not what is under test. Since #1029 the
      // write is the REST labels endpoint, made by `scripts/afk-add-label.sh`.
      'case "$*" in *"labels[]=agent:implement"*) ;; *) exit 0 ;; esac',
      'target=$(printf "%s" "$*" | sed -n "s|.*/issues/\\([0-9]*\\)/labels.*|\\1|p")',
      'if [ "$target" = "${GH_STUB_REJECT_ISSUE:-}" ]; then',
      '  echo "gh: Resource not accessible by integration (HTTP 403)" >&2',
      "  exit 1",
      "fi",
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

interface RunOptions {
  dependents: Dependent[];
  agentPat?: string;
  /** Make the promotion write fail for these tokens, to exercise the fallback. */
  rejectTokens?: string[];
  /** Make every promotion write for this issue fail, whichever token is used. */
  rejectIssue?: number;
  /** The exit status the step is expected to end on. */
  expectStatus?: number;
}

interface RunResult {
  stdout: string;
  /** Every `gh` invocation, as `<token>|<argv>`. */
  calls: string[];
  /**
   * Every `agent:implement` label add the step *attempted*, with the token it
   * used — a refused add is an attempt too, which is what lets a case assert
   * that the fallback was tried at all.
   */
  addAttempts: { issue: string; token: string }[];
}

function runPromotion(options: RunOptions): RunResult {
  writeFileSync(
    join(dir, "deps.txt"),
    options.dependents.map((dep) => dep.number).join("\n"),
  );
  for (const dep of options.dependents) {
    writeFileSync(join(dir, `info-${dep.number}.json`), infoJson(dep));
    // `index("agent:queued") // empty` — a position when still queued, empty
    // once a sibling run has taken it.
    writeFileSync(
      join(dir, `view-${dep.number}.txt`),
      dep.stillQueued === false ? "" : "0\n",
    );
  }

  const log = join(dir, "gh.log");
  writeFileSync(log, "");

  const run = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      GH_STUB_DIR: dir,
      GH_STUB_LOG: log,
      GH_STUB_REJECT_TOKENS: (options.rejectTokens ?? []).join(" "),
      GH_STUB_REJECT_ISSUE: options.rejectIssue
        ? String(options.rejectIssue)
        : "",
      GITHUB_TOKEN: "github-token",
      AGENT_PAT: options.agentPat ?? "",
      GH_REPO: "leomontigatti/en-escena",
      CLOSED_NUMBER: String(CLOSED_NUMBER),
    },
  });

  expect(run.status, `step stderr: ${run.stderr}`).toBe(
    options.expectStatus ?? 0,
  );

  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);

  return {
    stdout: run.stdout,
    calls,
    addAttempts: calls
      .map((call) =>
        /^(.*)\|api -X POST repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels -f labels\[\]=agent:implement$/.exec(
          call,
        ),
      )
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ issue: match[2], token: match[1] })),
  };
}

/**
 * The issues the step tried to label, deduplicated — the PAT attempt and the
 * fallback that follows it are one issue. Whether the attempt *succeeded* is not
 * in here: that is what the stdout assertions are for.
 */
function attemptedNumbers(result: RunResult): string[] {
  return [...new Set(result.addAttempts.map(({ issue }) => issue))].sort();
}

describe("the promote step's PAT-or-fallback (#1027)", () => {
  it("promotes with AGENT_PAT, the only token that wakes Implement", () => {
    const result = runPromotion({
      dependents: [{ number: 11 }],
      agentPat: "the-pat",
    });

    expect(result.addAttempts).toEqual([{ issue: "11", token: "the-pat" }]);
    expect(result.stdout).toContain("Promoted #11 to agent:implement.");
  });

  it("falls back to github.token when there is no PAT", () => {
    const result = runPromotion({ dependents: [{ number: 11 }] });

    expect(result.addAttempts).toEqual([
      { issue: "11", token: "github-token" },
    ]);
  });

  it("falls back to github.token when the PAT is refused", () => {
    const result = runPromotion({
      dependents: [{ number: 11 }],
      agentPat: "the-pat",
      rejectTokens: ["the-pat"],
    });

    expect(result.addAttempts.map(({ token }) => token)).toEqual([
      "the-pat",
      "github-token",
    ]);
    expect(result.stdout).toContain("AGENT_PAT label add failed for #11");
    expect(result.stdout).toContain("Promoted #11 to agent:implement.");
  });

  it("never claims an issue it could not promote, and fails the run", () => {
    // Both tokens refused. `agent:queued` is already off the issue, so it now
    // carries neither label: the state machine reads it as fresh work and hits
    // the same refusal on every later trigger. A green run printing
    // "Promoted #11" would hide that indefinitely.
    const result = runPromotion({
      dependents: [{ number: 11 }],
      agentPat: "the-pat",
      rejectTokens: ["the-pat", "github-token"],
      expectStatus: 1,
    });

    expect(result.stdout).not.toContain("Promoted #11");
    expect(result.stdout).toContain("::error::Could not label #11");
    expect(result.stdout).toContain("Could not promote: 11");
  });

  it("keeps promoting the rest of the list past an issue it cannot promote", () => {
    // Every promotion write aimed at #11 is refused, whichever token carries
    // it. The loop must not abandon #12 — one stuck issue costs only itself.
    const result = runPromotion({
      dependents: [{ number: 11 }, { number: 12 }],
      agentPat: "the-pat",
      rejectIssue: 11,
      expectStatus: 1,
    });

    expect(result.stdout).toContain("::error::Could not label #11");
    expect(result.stdout).not.toContain("Promoted #11");
    expect(result.stdout).toContain("Promoted #12 to agent:implement.");
    // Only #11 is named at the end: carrying on must not enlist #12 in the list
    // of failures, and must not clear #11 from it either.
    expect(result.stdout).toContain("Could not promote: 11\n");
    expect(attemptedNumbers(result)).toEqual(["11", "12"]);
  });

  it("promotes nothing when the dependent still has an open blocker", () => {
    const result = runPromotion({
      dependents: [{ number: 11, openBlockers: 2 }],
      agentPat: "the-pat",
    });

    expect(attemptedNumbers(result)).toEqual([]);
    expect(result.stdout).toContain("#11 still has 2 open blocker(s)");
  });

  it("leaves an issue a sibling run already took", () => {
    const result = runPromotion({
      dependents: [{ number: 11, stillQueued: false }],
      agentPat: "the-pat",
    });

    expect(attemptedNumbers(result)).toEqual([]);
    expect(result.stdout).toContain("a sibling run won");
  });

  it("hands each gh call exactly one token (#956)", () => {
    const result = runPromotion({
      dependents: [{ number: 11 }],
      agentPat: "the-pat",
    });

    for (const call of result.calls) {
      expect(call.split("|")[0], `untokened gh call: ${call}`).not.toBe("");
    }
  });
});

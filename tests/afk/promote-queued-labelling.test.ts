import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Coverage for #1027. `agent-promote-queued.yml` flips an unblocked dependent
// from `agent:queued` to `agent:implement` (§4.7), and the flip is two writes:
// the removal, then a PAT-or-fallback add. The add used to run under `set +e`
// with its status unread, so a run both tokens refused went green printing
// "Promoted #Y" — leaving the issue carrying *neither* label, which the state
// machine reads as fresh work that then hits the same refusal, just as quietly.
//
// The cases below run the *shipped* bash, lifted out of the workflow the way
// `failure-reason-fallback.test.ts` does, with a stub `gh` on PATH: a copy of
// the script here could drift away from what ships and still be green.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW = ".github/workflows/agent-promote-queued.yml";
const STEP = "      - name: Promote unblocked dependents";

/** A step's `run:` body, dedented to column zero. */
function extractRunBody(workflow: string, step: string): string {
  const lines = readFileSync(join(repoRoot, workflow), "utf8").split("\n");

  const at = lines.indexOf(step);
  expect(at, `${workflow}: no step named ${step.trim()}`).toBeGreaterThan(-1);

  const run = lines.findIndex(
    (line, i) => i > at && /^\s*run: \|\s*$/.test(line),
  );
  expect(run, `${workflow}: the step has no \`run: |\` block`).toBeGreaterThan(
    at,
  );

  const indent = lines[run].length - lines[run].trimStart().length + 2;
  const body: string[] = [];
  for (let i = run + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      body.push("");
      continue;
    }
    if (!lines[i].startsWith(" ".repeat(indent))) break;
    body.push(lines[i].slice(indent));
  }

  return body.join("\n");
}

const script = extractRunBody(WORKFLOW, STEP);

interface Dependent {
  number: number;
  labels?: string[];
  /** Parent issue number — a sub-issue is refused, not promoted. */
  parent?: number;
  /** How many of its declared blockers are still open. */
  openBlockers?: number;
}

/** The GraphQL answer the step reads for one dependent. */
function infoJson(dep: Dependent): string {
  return JSON.stringify({
    data: {
      repository: {
        issue: {
          labels: { nodes: (dep.labels ?? []).map((name) => ({ name })) },
          parent: dep.parent ? { number: dep.parent } : null,
          blockedBy: {
            nodes: Array.from({ length: dep.openBlockers ?? 0 }, (_, i) => ({
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

  // Stub `gh`: answers the two GraphQL reads and the label re-fetch from canned
  // fixtures, records every invocation with the token it was handed, and can be
  // told to refuse the writes made with one token or aimed at one issue.
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    [
      "#!/usr/bin/env bash",
      "set -uo pipefail",
      'printf "%s|%s\\n" "${GH_TOKEN:-}" "$*" >> "$GH_STUB_LOG"',
      "",
      'if [ "${1:-}" = "api" ] && [ "${2:-}" = "graphql" ]; then',
      "  num=''",
      '  for arg in "$@"; do',
      '    case "$arg" in num=*) num="${arg#num=}" ;; esac',
      "  done",
      // The dependents query is the one that asks `gh` to do the filtering.
      '  case "$*" in',
      '    *--jq*) cat "$GH_STUB_DIR/deps.txt" ;;',
      '    *) cat "$GH_STUB_DIR/info-$num.json" ;;',
      "  esac",
      "  exit 0",
      "fi",
      "",
      'if [ "${1:-}" = "issue" ] && [ "${2:-}" = "view" ]; then',
      '  cat "$GH_STUB_DIR/queued-${3}.txt" 2>/dev/null || true',
      "  exit 0",
      "fi",
      "",
      // Refusals land on the label add only: the removal and the comment are
      // what put the issue in the state a refused add then strands it in, so
      // they have to succeed for the case to be the one under test.
      'case "$*" in',
      "  *--add-label*)",
      '    if [ "${GH_STUB_REJECT_ISSUE:-}" = "${3:-}" ]; then',
      '      echo "gh: Resource not accessible by integration (HTTP 403)" >&2',
      "      exit 1",
      "    fi",
      "    for rejected in ${GH_STUB_REJECT_TOKENS:-}; do",
      '      [ "${GH_TOKEN:-}" = "$rejected" ] || continue',
      '      echo "gh: Resource not accessible by integration (HTTP 403)" >&2',
      "      exit 1",
      "    done",
      "    ;;",
      "esac",
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
  /** Make every `gh` write with one of these tokens fail. */
  rejectTokens?: string[];
  /** Make every label add aimed at this issue fail, whichever token carries it. */
  rejectIssue?: number;
  expectStatus?: number;
}

interface RunResult {
  stdout: string;
  /** Every `gh` invocation, as `<token>|<argv>`. */
  calls: string[];
  /**
   * Every `--add-label agent:implement` call the step *made*, with the token
   * it carried. The stub logs a call before deciding whether to refuse it, so
   * a refused add appears here too: this says what was attempted, never what
   * succeeded. Only the step's own output can say that.
   */
  labelAttempts: { issue: string; token: string }[];
}

function runPromotion(options: RunOptions): RunResult {
  writeFileSync(
    join(dir, "deps.txt"),
    options.dependents.map((dep) => dep.number).join("\n"),
  );
  for (const dep of options.dependents) {
    writeFileSync(join(dir, `info-${dep.number}.json`), infoJson(dep));
    writeFileSync(
      join(dir, `queued-${dep.number}.txt`),
      (dep.labels ?? []).includes("agent:queued") ? "0\n" : "",
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
      CLOSED_NUMBER: "500",
    },
  });

  expect(run.status, `step stderr: ${run.stderr}`).toBe(
    options.expectStatus ?? 0,
  );

  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);

  return {
    stdout: run.stdout,
    calls,
    labelAttempts: calls
      .map((call) =>
        /^(.*)\|issue edit (\d+) --add-label agent:implement$/.exec(call),
      )
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ issue: match[2], token: match[1] })),
  };
}

/** The issues the step tried to label, deduplicated — a retried add is one. */
function attemptedNumbers(result: RunResult): string[] {
  return [...new Set(result.labelAttempts.map(({ issue }) => issue))].sort();
}

const queued = (number: number): Dependent => ({
  number,
  labels: ["agent:queued"],
});

describe("promoting an unblocked dependent (#1027)", () => {
  it("promotes with AGENT_PAT, the only token that wakes Implement", () => {
    const result = runPromotion({
      dependents: [queued(11)],
      agentPat: "the-pat",
    });

    expect(result.labelAttempts).toEqual([{ issue: "11", token: "the-pat" }]);
    expect(result.stdout).toContain("Promoted #11 to agent:implement.");
  });

  it("falls back to github.token when the PAT is refused", () => {
    const result = runPromotion({
      dependents: [queued(11)],
      agentPat: "the-pat",
      rejectTokens: ["the-pat"],
    });

    expect(result.labelAttempts.map(({ token }) => token)).toEqual([
      "the-pat",
      "github-token",
    ]);
    expect(result.stdout).toContain("AGENT_PAT label add failed for #11");
    expect(result.stdout).toContain("Promoted #11 to agent:implement.");
  });

  it("never claims an issue it could not promote, and fails the run", () => {
    // Both tokens refused, after `agent:queued` was already removed: the issue
    // carries neither label, so the next close reads it as fresh work and hits
    // the same refusal. A green "Promoted #11" would hide that indefinitely.
    const result = runPromotion({
      dependents: [queued(11)],
      agentPat: "the-pat",
      rejectTokens: ["the-pat", "github-token"],
      expectStatus: 1,
    });

    expect(result.stdout).not.toContain("Promoted #11");
    expect(result.stdout).toContain("::error::Could not label #11");
    expect(result.stdout).toContain("Could not promote: 11");
  });

  it("keeps promoting the rest of the list past an issue it cannot promote", () => {
    // Every label add aimed at #11 is refused, whichever token carries it. The
    // loop must not abandon #12 — one stranded issue costs only itself.
    const result = runPromotion({
      dependents: [queued(11), queued(12)],
      agentPat: "the-pat",
      rejectIssue: 11,
      expectStatus: 1,
    });

    expect(result.stdout).toContain("::error::Could not label #11");
    expect(result.stdout).toContain("Promoted #12 to agent:implement.");
    // #11 was *attempted* and refused, #12 attempted and promoted: the loop
    // reached both, which is the thing `continue` is here to guarantee.
    expect(attemptedNumbers(result)).toEqual(["11", "12"]);
    expect(result.stdout).toContain("Could not promote: 11");
  });

  it("leaves a dependent that is not agent:queued alone", () => {
    const result = runPromotion({
      dependents: [{ number: 11, labels: ["needs-triage"] }],
      agentPat: "the-pat",
    });

    expect(attemptedNumbers(result)).toEqual([]);
    expect(result.stdout).toContain("#11 not labeled agent:queued");
  });

  it("waits while a dependent still has open blockers of its own", () => {
    const result = runPromotion({
      dependents: [{ ...queued(11), openBlockers: 2 }, queued(12)],
      agentPat: "the-pat",
    });

    expect(attemptedNumbers(result)).toEqual(["12"]);
    expect(result.stdout).toContain("#11 still has 2 open blocker(s)");
  });

  it("hands each gh call exactly one token (#956)", () => {
    const result = runPromotion({
      dependents: [queued(11)],
      agentPat: "the-pat",
    });

    for (const call of result.calls) {
      expect(call.split("|")[0], `untokened gh call: ${call}`).not.toBe("");
    }
  });
});
/**
 * Every workflow carrying a PAT-or-fallback label block, found by the line that
 * makes one what it is: a `gh` write explicitly tokened with `AGENT_PAT`. Keyed
 * on code rather than on the prose the block prints, so a fourth copy that
 * words its fallback notice differently is still caught.
 *
 * The `toEqual` below pins the result, so enrolling a fourth copy is a
 * deliberate edit here — but an unenrolled one fails loudly rather than
 * silently shrinking the reach of the drift assertions.
 */
function workflowsWithTheBlock(): string[] {
  const dir = ".github/workflows";
  return readdirSync(join(repoRoot, dir))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => `${dir}/${file}`)
    .filter((workflow) =>
      readFileSync(join(repoRoot, workflow), "utf8").includes(
        'GH_TOKEN="$AGENT_PAT"',
      ),
    )
    .sort();
}

/** The `set +e` … `set -e` region around the block, dedented, plus what follows. */
function extractFallbackBlock(workflow: string): {
  block: string[];
  after: string[];
} {
  const lines = readFileSync(join(repoRoot, workflow), "utf8").split("\n");

  const marker = lines.findIndex((line) =>
    line.includes('GH_TOKEN="$AGENT_PAT"'),
  );
  let start = marker;
  while (start >= 0 && lines[start].trim() !== "set +e") start--;
  expect(start, `${workflow}: the block has no \`set +e\``).toBeGreaterThan(-1);

  let end = marker;
  while (end < lines.length && lines[end].trim() !== "set -e") end++;
  expect(end, `${workflow}: the block has no \`set -e\``).toBeLessThan(
    lines.length,
  );

  const indent = lines[start].length - lines[start].trimStart().length;
  return {
    block: lines.slice(start, end + 1).map((line) => line.slice(indent)),
    after: lines.slice(end + 1, end + 13),
  };
}

/** The block's lines, continuations rejoined, blanks and comments dropped. */
function statements(lines: string[]): string[] {
  const joined: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (joined.length > 0 && joined[joined.length - 1].endsWith("\\")) {
      joined[joined.length - 1] =
        `${joined[joined.length - 1].slice(0, -1).trim()} ${trimmed}`;
      continue;
    }
    joined.push(trimmed);
  }

  return joined.filter((line) => line !== "" && !line.startsWith("#"));
}

/** The name of the variable the block holds each `gh` call's exit status in. */
function statusVariable(block: string[]): string {
  const initialiser = statements(block)[1] ?? "";
  const name = /^(\w+)=1$/.exec(initialiser)?.[1];
  expect(
    name,
    `no \`<status>=1\` initialiser, so no status is being tracked: ${initialiser}`,
  ).toBeDefined();
  return name as string;
}

/**
 * The block's control flow, with everything workflow-specific replaced: the
 * `gh` call, the messages and the name of the status variable. What is left is
 * exactly the part #1027 is about — whether each status is read at all.
 */
function skeleton(block: string[]): string[] {
  const status = statusVariable(block);

  return statements(block).map((line) =>
    line
      .replace(new RegExp(`\\b${status}\\b`, "g"), "status")
      .replace(/^(GH_TOKEN="\$(?:AGENT_PAT|GITHUB_TOKEN)") .*$/, "$1 <call>")
      .replace(/^echo ".*"$/, "echo <message>"),
  );
}

/**
 * The two statements that must follow the block: the guard on the status, and
 * the `::error::` naming the item. Read as statements, not as free text, so a
 * bare unguarded `echo "::error::"` cannot satisfy them.
 */
function failureReport(workflow: string): { guard: string; error: string } {
  const { block, after } = extractFallbackBlock(workflow);
  const status = statusVariable(block);
  const [guard = "", error = ""] = statements(after);

  return {
    guard: guard.replace(new RegExp(`\\b${status}\\b`, "g"), "status"),
    error,
  };
}

describe("the PAT-or-fallback block is the same in every workflow that has it", () => {
  const workflows = workflowsWithTheBlock();

  it("finds the copies, so the comparisons below are not vacuous", () => {
    // Three today: the Implement → Review chain, the PRD chain, and the
    // queued → implement promotion. A copy dropped from a workflow should be
    // noticed here rather than quietly shrinking the assertions' reach.
    expect(workflows).toEqual([
      ".github/workflows/agent-implement-prd.yml",
      ".github/workflows/agent-implement.yml",
      ".github/workflows/agent-promote-queued.yml",
    ]);
  });

  it("reads the exit status of both the PAT call and the fallback", () => {
    // The absolute half of the check. Drift alone would be satisfied by every
    // copy regressing together, so pin the shape itself: one `status=$?` after
    // the `AGENT_PAT` call, one after the `github.token` fallback.
    expect(skeleton(extractFallbackBlock(workflows[0]).block)).toEqual([
      "set +e",
      "status=1",
      'if [ -n "${AGENT_PAT:-}" ]; then',
      'GH_TOKEN="$AGENT_PAT" <call>',
      "status=$?",
      'if [ "$status" -ne 0 ]; then',
      "echo <message>",
      "fi",
      "fi",
      'if [ "$status" -ne 0 ]; then',
      'GH_TOKEN="$GITHUB_TOKEN" <call>',
      "status=$?",
      "fi",
      "set -e",
    ]);
  });

  it.each(workflows.slice(1))(
    "%s has not drifted from the others",
    (workflow) => {
      // The relative half: fixing one copy and not another fails here. The
      // copies are inline `run:` bash in three separate workflows and differ in
      // endpoint, label and target; whether they should instead be one shared
      // script is an open design question (#1027), and until it is answered this
      // is what holds them together.
      expect(
        skeleton(extractFallbackBlock(workflow).block),
        `${workflow} drifted from ${workflows[0]}`,
      ).toEqual(skeleton(extractFallbackBlock(workflows[0]).block));
    },
  );

  it.each(workflows)("%s names the item both tokens refused", (workflow) => {
    // A block whose status is read but never acted on is the same silence: the
    // `::error::` has to be guarded by the status, and has to name the item
    // (`#$something`) rather than just announcing that something went wrong.
    const { guard, error } = failureReport(workflow);

    expect(guard, `${workflow} must act on the status it read`).toBe(
      'if [ "$status" -ne 0 ]; then',
    );
    expect(error, `${workflow} must name the item it could not label`).toMatch(
      /^echo "::error::[^"]*#\$\w+/,
    );
  });
});

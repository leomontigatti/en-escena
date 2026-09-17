import { execFileSync } from "node:child_process";
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

import { evalGha, jobConditions } from "./pr-workflows.test-support";

// Coverage for #1020: branch protection is strict, so every open `agent/*` PR is
// behind `master` the moment the one below it merges. `agent-label-behind-prs.yml`
// turns each push to `master` into the `agent:update-branch` label that starts
// Update Branch (§4.6) — the half of the loop a human used to do by hand, one
// `gh pr update-branch` per PR.
//
// The selection is a `run:` block that only ever executes inside GHA, against a
// GitHub that computes mergeability asynchronously. So the cases below run the
// *shipped* bash, lifted out of the workflow file the way
// `failure-reason-fallback.test.ts` does, with a stub `gh` on PATH — a copy of
// the script here could drift away from what ships and still be green.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW = ".github/workflows/agent-label-behind-prs.yml";
const STEP = "      - name: Label every behind agent/* PR";

/** The step's `run:` body, dedented to column zero. */
function extractLabellingScript(): string {
  const lines = readFileSync(join(repoRoot, WORKFLOW), "utf8").split("\n");

  const step = lines.indexOf(STEP);
  expect(step, `${WORKFLOW}: no step named ${STEP.trim()}`).toBeGreaterThan(-1);

  const run = lines.findIndex(
    (line, i) => i > step && /^\s*run: \|\s*$/.test(line),
  );
  expect(run, `${WORKFLOW}: the step has no \`run: |\` block`).toBeGreaterThan(
    step,
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

const script = extractLabellingScript();

interface Pr {
  number: number;
  headRefName: string;
  mergeStateStatus: string;
  labels?: string[];
}

function prJson(prs: Pr[]): string {
  return JSON.stringify(
    prs.map(({ labels = [], ...pr }) => ({
      ...pr,
      labels: labels.map((name) => ({ name })),
    })),
  );
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "afk-behind-prs-"));

  // Stub `gh`: serves one canned `pr list` answer per call (so the UNKNOWN
  // retry can be observed), records every invocation with the token it was
  // handed, and can be told to reject the writes made with one specific token.
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    [
      "#!/usr/bin/env bash",
      "set -uo pipefail",
      'printf "%s|%s\\n" "${GH_TOKEN:-}" "$*" >> "$GH_STUB_LOG"',
      'if [ "${1:-}" = "pr" ] && [ "${2:-}" = "list" ]; then',
      '  n=$(cat "$GH_STUB_DIR/calls" 2>/dev/null || echo 0)',
      "  n=$((n + 1))",
      '  echo "$n" > "$GH_STUB_DIR/calls"',
      '  f="$GH_STUB_DIR/list-$n.json"',
      '  [ -f "$f" ] || f="$GH_STUB_DIR/list-last.json"',
      '  cat "$f"',
      "  exit 0",
      "fi",
      'if [ -n "${GH_STUB_REJECT_TOKEN:-}" ] && [ "${GH_TOKEN:-}" = "$GH_STUB_REJECT_TOKEN" ]; then',
      '  echo "gh: Resource not accessible by integration (HTTP 403)" >&2',
      "  exit 1",
      "fi",
      "exit 0",
    ].join("\n"),
  );
  chmodSync(gh, 0o755);
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

interface RunOptions {
  /** One `gh pr list` answer per call; the last one repeats for further calls. */
  answers: Pr[][];
  agentPat?: string;
  /** Make `gh pr edit` fail for this token, to exercise the fallback. */
  rejectToken?: string;
  attempts?: number;
}

interface RunResult {
  stdout: string;
  /** Every `gh` invocation, as `<token>|<argv>`. */
  calls: string[];
  /** The PR numbers that received `agent:update-branch`, with the token used. */
  labelled: { pr: string; token: string }[];
}

function runLabelling(options: RunOptions): RunResult {
  options.answers.forEach((answer, i) => {
    writeFileSync(join(dir, `list-${i + 1}.json`), prJson(answer));
  });
  writeFileSync(
    join(dir, "list-last.json"),
    prJson(options.answers[options.answers.length - 1]),
  );

  const log = join(dir, "gh.log");
  writeFileSync(log, "");

  const stdout = execFileSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      GH_STUB_DIR: dir,
      GH_STUB_LOG: log,
      GH_STUB_REJECT_TOKEN: options.rejectToken ?? "",
      GITHUB_TOKEN: "github-token",
      AGENT_PAT: options.agentPat ?? "",
      GH_REPO: "leomontigatti/en-escena",
      BASE_REF: "master",
      MERGE_STATE_ATTEMPTS: String(options.attempts ?? 3),
      // The retry sleeps for real; the wait is not what is under test.
      MERGE_STATE_DELAY_SECONDS: "0",
    },
  });

  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);

  return {
    stdout,
    calls,
    labelled: calls
      .map((call) =>
        /^(.*)\|pr edit (\d+) --add-label agent:update-branch$/.exec(call),
      )
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ pr: match[2], token: match[1] })),
  };
}

/** The PR numbers labelled, deduplicated — a retried add is still one PR. */
function labelledNumbers(result: RunResult): string[] {
  return [...new Set(result.labelled.map(({ pr }) => pr))].sort();
}

describe("the push-to-master labelling step (#1020)", () => {
  it("labels every open agent/* PR that is behind", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
          },
          {
            number: 12,
            headRefName: "agent/issue-2",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      agentPat: "the-pat",
    });

    expect(labelledNumbers(result)).toEqual(["11", "12"]);
  });

  it("leaves a PR that is already current alone", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "CLEAN",
          },
          {
            number: 12,
            headRefName: "agent/issue-2",
            mergeStateStatus: "BLOCKED",
          },
          {
            number: 13,
            headRefName: "agent/issue-3",
            mergeStateStatus: "UNSTABLE",
          },
        ],
      ],
      agentPat: "the-pat",
    });

    expect(labelledNumbers(result)).toEqual([]);
    expect(result.stdout).toContain("No open agent/* PR is behind master");
  });

  it("skips a PR whose run holds the lock, so the next push picks it up", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
            labels: ["agent:in-progress"],
          },
          {
            number: 12,
            headRefName: "agent/issue-2",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      agentPat: "the-pat",
    });

    expect(labelledNumbers(result)).toEqual(["12"]);
  });

  it("does not re-add a label the PR is already carrying", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
            labels: ["agent:update-branch"],
          },
        ],
      ],
      agentPat: "the-pat",
    });

    expect(labelledNumbers(result)).toEqual([]);
  });

  it("ignores branches outside agent/*, however behind they are", () => {
    const result = runLabelling({
      answers: [
        [
          { number: 11, headRefName: "fix/humano", mergeStateStatus: "BEHIND" },
          {
            number: 12,
            headRefName: "renovate/vitest",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      agentPat: "the-pat",
    });

    expect(labelledNumbers(result)).toEqual([]);
  });

  it("re-asks while mergeability is still UNKNOWN, then labels what resolved", () => {
    // The push itself is what makes GitHub recompute: believing the first
    // answer would label nothing on exactly the event this workflow exists for.
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "UNKNOWN",
          },
        ],
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "UNKNOWN",
          },
        ],
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      attempts: 5,
      agentPat: "the-pat",
    });

    expect(result.calls.filter((c) => c.includes("pr list"))).toHaveLength(3);
    expect(labelledNumbers(result)).toEqual(["11"]);
  });

  it("gives up after the attempt cap without failing the run", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "UNKNOWN",
          },
          {
            number: 12,
            headRefName: "agent/issue-2",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      attempts: 2,
      agentPat: "the-pat",
    });

    expect(result.calls.filter((c) => c.includes("pr list"))).toHaveLength(2);
    expect(result.stdout).toContain("Gave up on 1 PR(s)");
    // What did resolve is still labelled: an unresolved PR costs only itself.
    expect(labelledNumbers(result)).toEqual(["12"]);
  });

  it("labels with AGENT_PAT, the only token that wakes Update Branch", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      agentPat: "the-pat",
    });

    expect(result.labelled).toEqual([{ pr: "11", token: "the-pat" }]);
  });

  it("falls back to github.token when there is no PAT", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
    });

    expect(result.labelled).toEqual([{ pr: "11", token: "github-token" }]);
  });

  it("falls back to github.token when the PAT is refused", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      agentPat: "the-pat",
      rejectToken: "the-pat",
    });

    expect(result.labelled.map(({ token }) => token)).toEqual([
      "the-pat",
      "github-token",
    ]);
    expect(result.stdout).toContain("AGENT_PAT label add failed for #11");
  });

  it("hands each gh call exactly one token (#956)", () => {
    const result = runLabelling({
      answers: [
        [
          {
            number: 11,
            headRefName: "agent/issue-1",
            mergeStateStatus: "BEHIND",
          },
        ],
      ],
      agentPat: "the-pat",
    });

    for (const call of result.calls) {
      expect(call.split("|")[0], `untokened gh call: ${call}`).not.toBe("");
    }
  });
});

describe("the push-to-master trigger itself", () => {
  const text = readFileSync(join(repoRoot, WORKFLOW), "utf8");

  it("fires on pushes to master only", () => {
    expect(text).toMatch(/^on:\n {2}push:\n {4}branches: \[master\]$/m);
  });

  it("asks for no more than the label write it makes", () => {
    expect(/^permissions:\n((?: {2}.*\n)+)/m.exec(text)?.[1]).toBe(
      "  pull-requests: write\n",
    );
  });

  it("refuses to run on a fork that inherited it (#635)", () => {
    // `false` / `true` are literals of the expression language, not context
    // values; the shared evaluator only knows tokens, so they are supplied.
    const forkedTo = (condition: string, fork: string): string =>
      evalGha(condition, {
        "github.event.repository.fork": fork,
        false: "false",
        true: "true",
      });

    for (const { job, condition } of jobConditions(WORKFLOW)) {
      expect(condition, `${WORKFLOW}: job \`${job}\` has no \`if:\``).not.toBe(
        "",
      );
      expect(forkedTo(condition, "true")).toBe("false");
      expect(forkedTo(condition, "false")).toBe("true");
    }
  });
});

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Regression coverage for the diagnosis-less timeout on #512. When a runner step
// hits its `timeout-minutes`, Actions kills the process tree: `runMain`'s catch
// never runs, no `failure_reason.txt` is written, and the orchestrator used to
// comment a bare "(no reason file written — check workflow logs)". The
// `failure()` steps now fall back to the tail of the agent log, which survives
// in OUTPUT_DIR.
//
// This bash only executes on a failed run, so without a test it ships unproven —
// and the `find | sort | head` pipeline is genuinely risky under
// `set -euo pipefail`. The cases below run the *shipped* snippet, lifted out of
// the workflow files, rather than a copy that could drift away from them.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The workflows carrying the fallback. The six label-triggered ones report by
 * labelling + commenting (§3.7); architecture-review is scheduled, so it has no
 * issue to label and reports into the run summary instead.
 */
const WORKFLOWS = [
  ".github/workflows/agent-implement.yml",
  ".github/workflows/agent-implement-pr.yml",
  ".github/workflows/agent-implement-prd.yml",
  ".github/workflows/agent-review.yml",
  ".github/workflows/agent-to-issues-prd.yml",
  ".github/workflows/agent-update-branch.yml",
  ".github/workflows/architecture-review.yml",
];

const BLOCK_START = /^\s*reason=\$\(cat "\$OUTPUT_DIR\/failure_reason\.txt"/;

/**
 * Lift the reason-resolution block out of a workflow's `failure()` step.
 *
 * Deliberately text-based: the repo has no YAML parser, and a raw slice is what
 * keeps this test honest — it runs the exact lines that ship.
 */
function extractReasonBlock(workflow: string): string {
  const lines = readFileSync(join(repoRoot, workflow), "utf8").split("\n");
  const start = lines.findIndex((line) => BLOCK_START.test(line));
  expect(start, `no reason block found in ${workflow}`).toBeGreaterThan(-1);

  const indent = lines[start].length - lines[start].trimStart().length;
  // The block ends at the `fi` closing the `if [ -z "$reason" ]`, the first one
  // back at the block's own indentation.
  const end = lines.findIndex(
    (line, i) => i > start && line === `${" ".repeat(indent)}fi`,
  );
  expect(end, `unterminated reason block in ${workflow}`).toBeGreaterThan(
    start,
  );

  return lines
    .slice(start, end + 1)
    .map((line) => line.slice(indent))
    .join("\n");
}

/** Executable lines only — the surrounding comments are workflow-specific. */
function executableLines(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "afk-failure-reason-"));
});

afterEach(() => {
  rmSync(outputDir, { force: true, recursive: true });
});

/**
 * Run the shipped block under the same shell options as the workflow step and
 * return what the orchestrator would put in its comment.
 */
function resolveReason(block: string): string {
  return execFileSync(
    "bash",
    ["-c", `set -euo pipefail\n${block}\nprintf '%s' "$reason"`],
    { encoding: "utf8", env: { ...process.env, OUTPUT_DIR: outputDir } },
  );
}

function writeLog(name: string, contents: string, ageSeconds = 0): string {
  const path = join(outputDir, name);
  writeFileSync(path, contents);
  if (ageSeconds > 0) {
    const when = new Date(Date.now() - ageSeconds * 1000);
    utimesSync(path, when, when);
  }
  return path;
}

describe("the failure_reason fallback shipped in the workflows", () => {
  // One representative copy drives the behaviour cases; the suite below pins
  // every workflow's copy to it, so covering one covers all seven.
  const block = extractReasonBlock(".github/workflows/agent-review.yml");

  it("prefers failure_reason.txt when runMain managed to write one", () => {
    writeFileSync(
      join(outputDir, "failure_reason.txt"),
      "Error: prefetch blew up",
    );
    writeLog("review.agent.log", "log line that must not be used");

    expect(resolveReason(block)).toBe("Error: prefetch blew up");
  });

  it("falls back to the agent log tail when the step was killed before writing a reason", () => {
    writeLog("review.agent.log", "iteration 4\nrunning the test suite\n");

    const reason = resolveReason(block);

    expect(reason).toContain("no `failure_reason.txt`");
    expect(reason).toContain("last 30 lines of the agent log");
    expect(reason).toContain("running the test suite");
  });

  it("caps the tail at 30 lines so the comment stays readable", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    writeLog("review.agent.log", `${lines.join("\n")}\n`);

    const reason = resolveReason(block);

    expect(reason).toContain("line 100");
    expect(reason).toContain("line 71");
    expect(reason).not.toContain("line 70");
  });

  it("degrades to the old message when there is no reason file and no log", () => {
    expect(resolveReason(block)).toBe(
      "(no reason file written — check workflow logs)",
    );
  });

  it("ignores an empty log rather than reporting an empty reason", () => {
    writeLog("review.agent.log", "");

    expect(resolveReason(block)).toBe(
      "(no reason file written — check workflow logs)",
    );
  });

  it("picks the newest log when a job ran more than one runner", () => {
    writeLog("implement.agent.log", "the older runner\n", 600);
    writeLog("write-pr.agent.log", "the newer runner\n");

    expect(resolveReason(block)).toContain("the newer runner");
  });

  it("still resolves a reason when many logs make sort race head down the pipe", () => {
    // `head -1` closing the pipe can leave `sort` at SIGPIPE (141), which
    // `pipefail` would surface as a failed assignment — aborting the step before
    // it labels the item blocked. The pipeline is guarded, so this stays green.
    for (let i = 0; i < 200; i++) {
      writeLog(`runner-${i}.agent.log`, `log ${i}\n`, 200 - i);
    }

    expect(resolveReason(block)).toContain("log 199");
  });

  it("guards the find|sort|head pipeline in every workflow", () => {
    for (const workflow of WORKFLOWS) {
      expect(
        extractReasonBlock(workflow),
        `${workflow} must not let a SIGPIPE abort its failure step`,
      ).toMatch(/cut -d' ' -f2- \|\| true/);
    }
  });
});

describe("the fallback is the same in every workflow that has it", () => {
  const reference = executableLines(extractReasonBlock(WORKFLOWS[0]));

  it.each(WORKFLOWS.slice(1))(
    "%s resolves the reason identically to the others",
    (workflow) => {
      // The block is duplicated on purpose: these steps run with a write token
      // on `pull_request_target`, where the checkout is the PR head, so calling
      // a script from the repo would execute PR-controlled code. Inline `run:`
      // bash comes from the base ref instead. This test is what keeps the copies
      // from drifting.
      expect(executableLines(extractReasonBlock(workflow))).toEqual(reference);
    },
  );
});

/** A runner step and the two numbers that must stay ordered. */
interface RunnerStep {
  workflow: string;
  name: string;
  timeoutMinutes: number | undefined;
  budgetMinutes: number | undefined;
}

/**
 * Every step that launches a runner, with its guardrails. Steps are 6-space
 * indented `- name:` entries; a runner step is one whose `run:` invokes a
 * `.sandcastle/` entrypoint.
 */
function runnerSteps(workflow: string): RunnerStep[] {
  const text = readFileSync(join(repoRoot, workflow), "utf8");
  const chunks = text.split(/^ {6}- name: /m).slice(1);

  return chunks
    .filter((chunk) => /run: pnpm exec tsx \.sandcastle\//.test(chunk))
    .map((chunk) => ({
      workflow,
      name: chunk.split("\n")[0].trim(),
      timeoutMinutes: Number(
        chunk.match(/^ {8}timeout-minutes: (\d+)/m)?.[1] ?? NaN,
      ),
      budgetMinutes: Number(
        chunk.match(/^ {10}AGENT_BUDGET_MINUTES: (\d+)/m)?.[1] ?? NaN,
      ),
    }))
    .map((step) => ({
      ...step,
      timeoutMinutes: Number.isNaN(step.timeoutMinutes)
        ? undefined
        : step.timeoutMinutes,
      budgetMinutes: Number.isNaN(step.budgetMinutes)
        ? undefined
        : step.budgetMinutes,
    }));
}

describe("runner guardrails", () => {
  const steps = WORKFLOWS.flatMap(runnerSteps);

  it("finds every runner step across the AFK workflows", () => {
    // `agent-implement` and `agent-implement-prd` each run two: the implement
    // pass and the write-pr pass that follows it.
    expect(steps).toHaveLength(9);
  });

  it.each(
    steps.map((step) => [`${step.workflow} → ${step.name}`, step] as const),
  )(
    "%s caps the step and gives the runner a smaller internal budget",
    (_label, step) => {
      // Both halves matter: without `timeout-minutes` a hang inherits the job's
      // 6 h default, and unless the budget is strictly smaller the step timeout
      // wins the race and kills the process before it can write a reason (#512).
      expect(step.timeoutMinutes).toBeDefined();
      expect(step.budgetMinutes).toBeDefined();
      expect(step.budgetMinutes!).toBeLessThan(step.timeoutMinutes!);
    },
  );
});

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workflowFiles, workflowText } from "./pr-workflows.test-support";

// Coverage for #956: the agent session runs inside the checked-out tree and
// reads issue and PR text, so nothing it can reach may hold a GitHub credential.
// `actions/checkout` persists the token it fetched with into `.git/config` by
// default; every checkout in this directory has to opt out, and the steps that
// push authenticate per command instead (docs/agents/afk-setup.md → "Where the
// PAT is during a run").
//
// Three properties, at the three levels they live at: the checkouts opt out
// (static), the pre-session guard refuses to start over a persisted credential
// (behavioural), and the push classifies its own failures (behavioural). The
// last two run the *shipped* bash, lifted out of the workflow files the way
// `failure-reason-fallback.test.ts` does, so neither can drift from what ships.

/**
 * Every line naming the action, however its `uses:` is spelled. The block
 * parser below matches a stricter shape, and this is what makes a checkout it
 * cannot see a failure rather than a silent gap in the audit.
 */
function checkoutMentions(file: string): number {
  return workflowText(file)
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && line.includes("actions/checkout@"))
    .length;
}

const CHECKOUT_USES = /^\s+(- )?uses: actions\/checkout@/;

function indentOf(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

/**
 * Whether `line` has left the step whose `uses:` sits at `indent`. A list item
 * *below* that indentation is a value inside the step (a `sparse-checkout:`
 * entry, say); one at or above it is the next step.
 */
function leavesStep(line: string, indent: number): boolean {
  const depth = indentOf(line);
  if (depth < indent) return true;
  return depth <= indent && /^\s*- /.test(line);
}

/** The lines nested under the step starting at `start`, blank ones dropped. */
function stepBody(lines: string[], start: number): string {
  const indent = indentOf(lines[start]);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (leavesStep(line, indent)) break;
    body.push(line);
  }
  return body.join("\n");
}

/** Every `- uses: actions/checkout@…` step block, as the text of its `with:` lines. */
function checkoutBlocks(file: string): string[] {
  const lines = workflowText(file).split("\n");
  return lines
    .map((line, i) => (CHECKOUT_USES.test(line) ? stepBody(lines, i) : null))
    .filter((block) => block !== null);
}

/**
 * Lift a shipped `run:` fragment out of a workflow: from the first line matching
 * `start` to the `fi` that closes it, dedented to column zero so it can be run.
 */
function liftBlock(file: string, start: RegExp): string {
  const lines = workflowText(file).split("\n");
  const from = lines.findIndex((line) => start.test(line));
  expect(from, `${file}: no block matching ${start}`).toBeGreaterThan(-1);

  const indent = lines[from].length - lines[from].trimStart().length;
  const to = lines.findIndex(
    (line, i) => i > from && line === `${" ".repeat(indent)}fi`,
  );
  expect(to, `${file}: unterminated block in ${file}`).toBeGreaterThan(from);

  return lines
    .slice(from, to + 1)
    .map((line) => line.slice(indent))
    .join("\n");
}

const GUARD_START =
  /^\s*if git config --get-all http\.https:\/\/github\.com\/\.extraheader/;
const PUSH_START = /^\s*auth=\$\(printf 'x-access-token:/;

/** The workflows that run an agent over the tree they checked out. */
function agentWorkflows(): string[] {
  return workflowFiles().filter((file) =>
    /git config user\.name "claude-code\[bot\]"/.test(workflowText(file)),
  );
}

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "afk-checkout-credentials-"));
});

afterEach(() => {
  rmSync(scratch, { force: true, recursive: true });
});

/** A git invocation that ignores the ambient user/global config entirely. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: isolatedEnv(),
  });
}

function isolatedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // The suite itself runs inside a checkout that may carry an extraheader of
    // its own; the fixtures below must see only the config they set.
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    HOME: scratch,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
  };
}

function runShipped(
  block: string,
  cwd: string,
  env: Record<string, string> = {},
): { status: number; stderr: string } {
  const result = spawnSync("bash", ["-c", `set -euo pipefail\n${block}`], {
    cwd,
    encoding: "utf8",
    env: { ...isolatedEnv(), ...env },
  });
  return { status: result.status ?? -1, stderr: result.stderr };
}

describe("no checkout persists a credential (#956)", () => {
  it("sets persist-credentials: false on every actions/checkout in every workflow", () => {
    let seen = 0;
    let mentioned = 0;
    for (const file of workflowFiles()) {
      mentioned += checkoutMentions(file);
      for (const block of checkoutBlocks(file)) {
        seen += 1;
        expect(
          block,
          `${file}: a checkout without \`persist-credentials: false\` leaves its token in .git/config`,
        ).toMatch(/^\s+persist-credentials: false\s*$/m);
        expect(
          block,
          `${file}: a checkout \`token:\` only matters when it is persisted; push steps authenticate per command`,
        ).not.toMatch(/^\s+token:/m);
      }
    }
    // The audit is only meaningful if it saw every checkout there is.
    expect(mentioned).toBeGreaterThan(0);
    expect(seen).toBe(mentioned);
  });
});

describe("the pre-session guard shipped in the workflows", () => {
  // One representative copy drives the behaviour cases; the suite below pins
  // every workflow's copy to it, so covering one covers all of them.
  const block = liftBlock(".github/workflows/agent-review.yml", GUARD_START);

  function repoWithConfig(...config: string[]): string {
    const repo = join(scratch, "repo");
    mkdirSync(repo);
    git(repo, "init", "--quiet", ".");
    if (config.length > 0) git(repo, "config", ...config);
    return repo;
  }

  it("lets the agent start when the checkout persisted nothing", () => {
    expect(runShipped(block, repoWithConfig()).status).toBe(0);
  });

  it("refuses to start the agent when a credential is persisted", () => {
    const repo = repoWithConfig(
      "http.https://github.com/.extraheader",
      "AUTHORIZATION: basic c2VjcmV0",
    );

    const { status, stderr } = runShipped(block, repo);

    expect(status).toBe(1);
    expect(stderr).toContain("refusing to start the agent");
  });

  it("refuses when the credential was persisted globally rather than in the tree", () => {
    const repo = repoWithConfig();
    const globalConfig = join(scratch, "global-config");
    execFileSync(
      "git",
      [
        "config",
        "--file",
        globalConfig,
        "http.https://github.com/.extraheader",
        "AUTHORIZATION: basic c2VjcmV0",
      ],
      { env: isolatedEnv() },
    );

    expect(
      runShipped(block, repo, { GIT_CONFIG_GLOBAL: globalConfig }).status,
    ).toBe(1);
  });

  it("ships in every workflow that starts an agent over its checkout", () => {
    for (const file of agentWorkflows()) {
      expect(
        liftBlock(file, GUARD_START),
        `${file}: the identity step must refuse to start the agent over a persisted credential`,
      ).toBe(block);
    }
    expect(agentWorkflows().length).toBeGreaterThanOrEqual(5);
  });
});

describe("the race-safe push shipped in the workflows", () => {
  const block = liftBlock(".github/workflows/agent-review.yml", PUSH_START);

  interface Fixture {
    work: string;
    outputDir: string;
    /** The remote's head when the run started — what the lease is taken against. */
    branchHeadSha: string;
  }

  /** A work tree one commit ahead of its `origin`, as a push step finds it. */
  function fixture(): Fixture {
    const origin = join(scratch, "origin.git");
    const work = join(scratch, "work");
    const outputDir = join(scratch, "out");
    mkdirSync(work);
    mkdirSync(outputDir);

    git(scratch, "init", "--quiet", "--bare", origin);
    git(work, "init", "--quiet", "--initial-branch", "feature", ".");
    git(work, "commit", "--quiet", "--allow-empty", "-m", "base");
    git(work, "remote", "add", "origin", origin);
    git(work, "push", "--quiet", "origin", "feature");
    const branchHeadSha = git(work, "rev-parse", "HEAD").trim();
    git(work, "commit", "--quiet", "--allow-empty", "-m", "the agent's commit");

    return { work, outputDir, branchHeadSha };
  }

  function push(f: Fixture): { status: number; reason: string } {
    const { status } = runShipped(block, f.work, {
      PUSH_TOKEN: "ghp_notarealtoken",
      BRANCH: "feature",
      BRANCH_HEAD_SHA: f.branchHeadSha,
      OUTPUT_DIR: f.outputDir,
    });
    const reasonFile = join(f.outputDir, "failure_reason.txt");
    let reason = "";
    try {
      reason = readFileSync(reasonFile, "utf8").trim();
    } catch {
      reason = "";
    }
    return { status, reason };
  }

  it("pushes the agent's commit and reports no failure", () => {
    const f = fixture();

    const { status, reason } = push(f);

    expect(status).toBe(0);
    expect(reason).toBe("");
    expect(
      git(f.work, "rev-parse", "origin/feature").trim(),
      "the commit must actually reach the remote",
    ).toBe(git(f.work, "rev-parse", "HEAD").trim());
  });

  it("reports the race when the branch advanced under the lease", () => {
    const f = fixture();
    // Someone else pushed while the agent was working: the lease is stale.
    const other = join(scratch, "other");
    git(
      scratch,
      "clone",
      "--quiet",
      "--branch",
      "feature",
      join(scratch, "origin.git"),
      other,
    );
    git(other, "commit", "--quiet", "--allow-empty", "-m", "someone else");
    git(other, "push", "--quiet", "origin", "HEAD:feature");

    const { status, reason } = push(f);

    expect(status).toBe(1);
    expect(reason).toBe("Branch advanced during review run.");
  });

  it("fails the step when the push fails for any other reason", () => {
    // A token without the `workflow` scope, a dead remote: not a lost race. This
    // used to leave the step green with nothing pushed, because only the race
    // patterns were matched and the push's own exit status was discarded (#956).
    const f = fixture();
    git(f.work, "remote", "set-url", "origin", join(scratch, "no-such-repo"));

    const { status, reason } = push(f);

    expect(status).toBe(1);
    expect(reason).toBe("Push failed; git's output is in the step log.");
  });
});

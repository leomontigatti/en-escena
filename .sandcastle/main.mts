// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
//   npx tsx .sandcastle/main.mts --issue 4
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { runWithRetry } from "./run-with-retry.mjs";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});
type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  labels: z.array(z.object({ name: z.string() })),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;
const CODEX_MODEL = "gpt-5.5";
const CODEX_EFFORT = "medium";
const READY_FOR_AGENT_LABEL = "ready-for-agent";
const DEFAULT_SANDBOX_DOCKER_NETWORK = "en-escena_default";
const DEFAULT_SANDBOX_TEST_DATABASE_URL =
  "postgres://postgres:postgres@postgres:5432/en-escena-test";

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: {
    onSandboxReady: [{ command: "npm install" }],
  },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

assertGitHeadExists();
assertCodexChatGptAuthWorks();
assertGitHubTokenWorks();

const TARGET_BRANCH = getCurrentBranch();
const requestedIssueId = parseIssueArg(process.argv.slice(2));
const maxIterations = requestedIssueId ? 1 : MAX_ITERATIONS;

if (requestedIssueId) {
  console.log(`Running Sandcastle for issue #${requestedIssueId} only.`);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= maxIterations; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${maxIterations} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const issues = requestedIssueId
    ? [getRequestedIssue(requestedIssueId)]
    : await planNextIssues();

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(
    `Planning complete. ${issues.length} issue(s) to work in parallel:`,
  );
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review
  //
  // For each issue, create a sandbox via createSandbox() so the implementer
  // and reviewer share the same sandbox instance per branch. The implementer
  // runs first; if it produces commits, the reviewer runs in the same sandbox.
  //
  // Promise.allSettled means one failing pipeline doesn't cancel the others.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: createDockerSandbox(),
        hooks,
        copyToWorktree,
      });

      try {
        // Run the implementer
        const implement = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          agent: createCodexAgent(),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });

        // Only review if the implementer produced commits
        if (implement.commits.length > 0) {
          const review = await sandbox.run({
            name: "reviewer",
            maxIterations: 1,
            agent: createCodexAgent(),
            promptFile: "./.sandcastle/review-prompt.md",
            promptArgs: {
              BASE_BRANCH: TARGET_BRANCH,
              BRANCH: issue.branch,
            },
          });

          // Merge commits from both runs so the merge phase sees all of them.
          // Each sandbox.run() only returns commits from its own run.
          return {
            ...review,
            commits: [...implement.commits, ...review.commits],
          };
        }

        return implement;
      } finally {
        await sandbox.close();
      }
    }),
  );

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(
        `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`,
      );
    }
  }

  // Only pass branches that actually produced commits to the merge phase.
  // An agent that ran successfully but made no commits has nothing to merge.
  const completedIssues = settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        entry.outcome.value.commits.length > 0,
    )
    .map((entry) => entry.issue);

  const completedBranches = completedIssues.map((i) => i.branch);

  console.log(
    `\nExecution complete. ${completedBranches.length} branch(es) with commits:`,
  );
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    console.log("No commits produced. Nothing to merge.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge
  //
  // One agent merges all completed branches into the current branch,
  // resolving any conflicts and running tests to confirm everything works.
  //
  // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
  // uses to know which branches to merge and which issues to close.
  // -------------------------------------------------------------------------
  await sandcastle.run({
    hooks,
    sandbox: createDockerSandbox(),
    name: "merger",
    maxIterations: 1,
    agent: createCodexAgent(),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: {
      // A markdown list of branch names, one per line.
      BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
      // A markdown list of issue IDs and titles, one per line.
      ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
    },
  });

  console.log("\nBranches merged.");
}

console.log("\nAll done.");

function parseIssueArg(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined;

  const [first, second, ...rest] = args;
  let issueId: string | undefined;

  if (first === "--issue" || first === "-i") {
    issueId = second;
    if (rest.length > 0) throw new Error(usageMessage());
  } else if (first?.startsWith("--issue=")) {
    issueId = first.slice("--issue=".length);
    if (second !== undefined || rest.length > 0) throw new Error(usageMessage());
  } else if (first && /^\d+$/.test(first)) {
    issueId = first;
    if (second !== undefined || rest.length > 0) throw new Error(usageMessage());
  } else {
    throw new Error(usageMessage());
  }

  if (!issueId || !/^\d+$/.test(issueId)) {
    throw new Error(usageMessage());
  }

  return issueId;
}

function usageMessage(): string {
  return "Usage: npm run sandcastle [-- --issue <number>] or npm run sandcastle [-- <number>]";
}

function createCodexAgent(): ReturnType<typeof sandcastle.codex> {
  return sandcastle.codex(CODEX_MODEL, { effort: CODEX_EFFORT });
}

function createDockerSandbox(): ReturnType<typeof docker> {
  const env = readSandcastleEnv();
  const ghToken = getGitHubToken();
  const codexAuthJsonPath = getCodexAuthJsonPath();
  const network = getSandboxDockerNetwork(env);
  const testDatabaseUrl = getSandboxTestDatabaseUrl(env);

  return docker({
    ...(network ? { network } : {}),
    mounts: [
      {
        hostPath: codexAuthJsonPath,
        sandboxPath: "/home/agent/.codex/auth.json",
        readonly: true,
      },
    ],
    env: {
      DATABASE_URL: testDatabaseUrl,
      GH_TOKEN: ghToken,
      TEST_DATABASE_URL: testDatabaseUrl,
    },
  });
}

async function planNextIssues(): Promise<readonly PlannedIssue[]> {
  const plan = await runWithRetry({
    hooks,
    sandbox: createDockerSandbox(),
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code. (Structured output requires maxIterations: 1.)
    maxIterations: 1,
    // Use the same Codex model across planning, implementation, and review.
    agent: createCodexAgent(),
    promptFile: "./.sandcastle/plan-prompt.md",
    // Extract and validate the <plan> JSON into a typed object. Retry output
    // extraction failures so a malformed JSON block does not abort the run.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  return plan.output.issues;
}

function getRequestedIssue(issueId: string): PlannedIssue {
  const issueJson = execFileSync(
    "gh",
    [
      "issue",
      "view",
      issueId,
      "--json",
      "number,title,state,labels",
    ],
    {
      encoding: "utf8",
      env: getGitHubCliEnv(),
    },
  );
  const issue = issueSchema.parse(JSON.parse(issueJson));

  if (issue.state !== "OPEN") {
    throw new Error(`Issue #${issueId} is ${issue.state}, not OPEN.`);
  }

  const labels = issue.labels.map((label) => label.name);
  if (!labels.includes(READY_FOR_AGENT_LABEL)) {
    throw new Error(
      `Issue #${issueId} does not have the ${READY_FOR_AGENT_LABEL} label.`,
    );
  }

  return {
    id: String(issue.number),
    title: issue.title,
    branch: `sandcastle/issue-${issue.number}`,
  };
}

function assertGitHeadExists(): void {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    throw new Error(
      [
        "Sandcastle needs this repository to have at least one commit before it can create worktrees.",
        "Create or fetch a base commit, then rerun the command.",
      ].join("\n"),
    );
  }
}

function getCurrentBranch(): string {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();

  if (!branch) {
    throw new Error("Sandcastle must be run from a named branch, not detached HEAD.");
  }

  return branch;
}

function assertGitHubTokenWorks(): void {
  try {
    execFileSync(
      "gh",
      ["issue", "list", "--state", "open", "--limit", "1", "--json", "number"],
      {
        encoding: "utf8",
        env: getGitHubCliEnv(),
        stdio: "pipe",
      },
    );
  } catch {
    throw new Error(
      [
        "GitHub rejected GH_TOKEN from .sandcastle/.env.",
        "Create a fine-grained token for leomontigatti/en-escena with Issues read/write and Metadata read, then update GH_TOKEN.",
      ].join("\n"),
    );
  }
}

function getGitHubCliEnv(): NodeJS.ProcessEnv {
  const token = getGitHubToken();

  return {
    ...process.env,
    GH_TOKEN: token,
  };
}

function getGitHubToken(): string {
  const env = readSandcastleEnv();
  const token = env.GH_TOKEN || process.env.GH_TOKEN;

  if (!token) {
    throw new Error("Sandcastle needs GH_TOKEN in .sandcastle/.env.");
  }

  return token;
}

function assertCodexChatGptAuthWorks(): void {
  const authJsonPath = getCodexAuthJsonPath();
  if (!existsSync(authJsonPath)) {
    throw new Error(
      [
        `Codex ChatGPT auth file was not found at ${authJsonPath}.`,
        "Run `codex login` on the host with your ChatGPT account, then rerun Sandcastle.",
      ].join("\n"),
    );
  }

  const status = spawnSync("codex", ["login", "status"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = [status.stdout, status.stderr].join("\n");

  if (status.status !== 0 || !/Logged in using ChatGPT/i.test(output)) {
    throw new Error(
      [
        "Host Codex CLI is not logged in with ChatGPT subscription auth.",
        "Run `codex login` on the host with your ChatGPT account, then rerun Sandcastle.",
      ].join("\n"),
    );
  }
}

function getCodexAuthJsonPath(): string {
  const env = readSandcastleEnv();
  return env.CODEX_AUTH_JSON || process.env.CODEX_AUTH_JSON || defaultCodexAuthJsonPath();
}

function defaultCodexAuthJsonPath(): string {
  return join(homedir(), ".codex", "auth.json");
}

function getSandboxDockerNetwork(env: Record<string, string>): string | undefined {
  const network =
    env.SANDCASTLE_DOCKER_NETWORK ||
    process.env.SANDCASTLE_DOCKER_NETWORK ||
    DEFAULT_SANDBOX_DOCKER_NETWORK;

  return network || undefined;
}

function getSandboxTestDatabaseUrl(env: Record<string, string>): string {
  return (
    env.SANDCASTLE_TEST_DATABASE_URL ||
    process.env.SANDCASTLE_TEST_DATABASE_URL ||
    DEFAULT_SANDBOX_TEST_DATABASE_URL
  );
}

function readSandcastleEnv(): Record<string, string> {
  const envPath = join(process.cwd(), ".sandcastle", ".env");
  if (!existsSync(envPath)) return {};

  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    env[key] = stripEnvQuotes(rawValue);
  }

  return env;
}

function stripEnvQuotes(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  if (
    value.length >= 2 &&
    ((first === '"' && last === '"') || (first === "'" && last === "'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

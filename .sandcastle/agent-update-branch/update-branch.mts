// Runner: Update Branch — spec §4.6.
//
// Brings a PR branch up to date with its base. THE RUNNER SCRIPT does the
// deterministic merge itself; the agent is invoked ONLY when that merge
// conflicts. Three short-circuits:
//   - already up to date  → comment.md, should_push=false, agent never runs.
//   - clean merge         → comment.md, should_push=true,  agent never runs.
//   - conflicts           → agent resolves, we assert no unresolved files + a
//                           finished merge commit, then should_push=true.
//
// Env: PR_NUMBER, BRANCH, BASE_REF, GH_REPO, OUTPUT_DIR. GH_TOKEN is present for
// the read-only `gh pr view` prefetch only; the agent holds no token.

import { execFileSync, spawnSync } from "node:child_process";

import { Output } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  streamingLog,
  writeFailure,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithExtraction } from "../lib/run-with-extraction.mjs";
import { updateBranchSchema } from "./output.mjs";

const EXTRACTION_PROMPT = [
  "The merge is resolved and committed. Now emit the structured output. Change nothing",
  "further — only report.",
  "",
  "Emit a single `<output>` block as the last thing in your response: a `comment` field with a",
  "markdown PR comment describing what conflicted, how you resolved each hunk, and any uncertainty.",
].join("\n");

/** Run git, returning trimmed stdout; throws (→ failure_reason) on non-zero. */
function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

await runMain(async () => {
  const prNumber = requireEnv("PR_NUMBER");
  const branch = requireEnv("BRANCH");
  const baseRef = requireEnv("BASE_REF");

  // Fetch the base into its remote-tracking ref so `origin/<base>` is a real ref
  // the merge and the agent's `git log origin/<base>` can both use.
  execFileSync("git", ["fetch", "origin", `${baseRef}:refs/remotes/origin/${baseRef}`], {
    stdio: "inherit",
  });

  const baseSha = git(["rev-parse", `refs/remotes/origin/${baseRef}`]);
  const mergeBase = git(["merge-base", "HEAD", `refs/remotes/origin/${baseRef}`]);

  // Already up to date: base is an ancestor of HEAD — nothing to merge.
  if (mergeBase === baseSha) {
    writeOutput(
      "comment.md",
      `Branch \`${branch}\` is already up to date with \`${baseRef}\` — nothing to merge.`,
    );
    writeOutput("should_push.txt", "false");
    return;
  }

  const preMergeHead = git(["rev-parse", "HEAD"]);

  // Attempt the deterministic merge. Non-zero exit ⇒ conflicts (or another
  // failure we surface). We do NOT throw on non-zero here — we classify it.
  const merge = spawnSync("git", ["merge", `origin/${baseRef}`, "--no-edit"], {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (merge.status === 0) {
    // Clean merge (a merge commit or a fast-forward). The agent never runs.
    writeOutput(
      "comment.md",
      `Merged \`${baseRef}\` into \`${branch}\` cleanly — no conflicts to resolve.`,
    );
    writeOutput("should_push.txt", "true");
    return;
  }

  // --- Conflict path: the working tree is now in the conflicted state. ---
  const prView = execFileSync("gh", ["pr", "view", prNumber], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const mergeStatus = execFileSync("git", ["status"], { encoding: "utf8" });
  const conflictingFiles = git(["diff", "--name-only", "--diff-filter=U"]);

  const result = await runWithExtraction({
    name: "update-branch",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("update-branch"),
    maxIterations: 100,
    promptFile: "./.sandcastle/agent-update-branch/prompt.md",
    promptArgs: {
      PR_NUMBER: prNumber,
      BRANCH: branch,
      BASE_REF: baseRef,
      PR_VIEW: prView,
      MERGE_STATUS: mergeStatus,
      CONFLICTING_FILES: conflictingFiles,
    },
    extractionPrompt: EXTRACTION_PROMPT,
    output: Output.object({ tag: "output", schema: updateBranchSchema }),
  });

  // Assert the agent actually finished the merge (§4.6 failure handling).
  const unresolved = git(["diff", "--name-only", "--diff-filter=U"]);
  if (unresolved) {
    writeFailure(`Agent left unresolved conflicts:\n${unresolved}`);
    process.exitCode = 1;
    return;
  }

  const mergeStillInProgress =
    spawnSync("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).status === 0;
  const newHead = git(["rev-parse", "HEAD"]);
  if (mergeStillInProgress || newHead === preMergeHead) {
    writeFailure("Agent did not finish the merge with a commit.");
    process.exitCode = 1;
    return;
  }

  writeOutput("comment.md", result.output.comment);
  writeOutput("should_push.txt", "true");
});

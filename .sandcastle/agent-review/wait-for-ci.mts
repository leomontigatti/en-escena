// Workflow step: wait for the `CI` run on the reviewed head and write the block
// the review prompt embeds (issue #966).
//
// A step of its own rather than part of the runner's prefetch: the runner starts
// its `AGENT_BUDGET_MINUTES` clock the moment it boots, so a wait inside it would
// be taken out of the agent's thinking time. The runner reads the file this
// leaves behind (`context.mts` → `ciResults`).
//
// Never exits non-zero. A timeout, a missing run or a broken `gh` all degrade to
// `not finished`; nothing here may turn a green branch into a blocked PR.
//
// Env: GH_REPO, BRANCH_HEAD_SHA, OUTPUT_DIR.

import { gh } from "../lib/gh.mjs";
import { sleepSync } from "../lib/sleep.mjs";
import { writeOutput } from "../lib/runner.mjs";

import { CI_RESULTS_FILE } from "./context.mjs";
import { formatCiBlock, waitForCi } from "./ci-status.mjs";

const repo = process.env.GH_REPO ?? "";
const sha = process.env.BRANCH_HEAD_SHA ?? "";

const status =
  repo === "" || sha === ""
    ? { outcome: "not finished" as const, detail: "The runner was started without GH_REPO/BRANCH_HEAD_SHA." }
    : waitForCi(repo, sha, { gh, sleep: sleepSync, now: () => Date.now() });

const block = formatCiBlock(status);
writeOutput(CI_RESULTS_FILE, block);
console.log(block);

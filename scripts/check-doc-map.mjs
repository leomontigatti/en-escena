import { spawnSync } from "node:child_process";

import {
  DOC_CHANGE_NOT_NEEDED_TRAILER,
  findDocChangeNotNeededReasons,
  findUndocumentedChanges,
  formatUndocumentedChange,
  readDocMap,
} from "./doc-map.mjs";

/**
 * Fails a PR that changes code mapped to a current-state document without
 * touching that document. Why a mechanism instead of a process rule, and why
 * this one, is explained once in scripts/doc-map.mjs.
 *
 * Runs in CI and locally, so the GitHub Actions annotation prefix is only
 * emitted under Actions, where it means something.
 *
 * Usage: node scripts/check-doc-map.mjs [base-ref]
 */

const baseRef = process.argv[2] ?? "origin/master";
const errorPrefix = process.env.GITHUB_ACTIONS === "true" ? "::error::" : "";

/**
 * @param {string[]} args
 * @returns {string | undefined}
 */
function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });

  return result.status === 0 ? result.stdout : undefined;
}

/**
 * A git failure under Actions is a broken checkout, not a clean branch: the
 * base ref was never fetched, or `fetch-depth` truncated it. Passing then would
 * leave a required check green while comparing nothing — the decorative gate
 * this mechanism exists to avoid. Locally the same failure is ordinary (a clone
 * with no `origin/master`), so there it stays a skip.
 *
 * @param {string} message
 * @returns {never}
 */
function giveUp(message) {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error(`${errorPrefix}${message}`);
    process.exit(1);
  }

  console.log(message);
  process.exit(0);
}

const mergeBase = git(["merge-base", baseRef, "HEAD"])?.trim();

if (!mergeBase) {
  giveUp(
    `No merge base with ${baseRef}; nothing to compare against. Fetch it first with \`git fetch --no-tags origin master\`.`,
  );
}

// `--no-renames` on purpose: a mapped file moved out of its directory should
// fire on its old path, because rehoming documented code is precisely when the
// document needs to move too.
const diff = git(["diff", "--name-only", "--no-renames", mergeBase, "HEAD"]);

if (diff === undefined) {
  giveUp(`Could not diff ${mergeBase}..HEAD; nothing to compare against.`);
}

const changedFiles = diff.split("\n").filter(Boolean);

const undocumentedChanges = findUndocumentedChanges({
  docMap: readDocMap(),
  changedFiles,
});

if (undocumentedChanges.length === 0) {
  console.log(`Documented code changed in step with its documents.`);
  process.exit(0);
}

const reasons = findDocChangeNotNeededReasons(
  git(["log", "--format=%B", `${mergeBase}..HEAD`]) ?? "",
);

if (reasons.length > 0) {
  console.log(
    `${DOC_CHANGE_NOT_NEEDED_TRAILER} declared, gate skipped:\n${reasons
      .map((reason) => `  - ${reason}`)
      .join("\n")}`,
  );
  process.exit(0);
}

for (const change of undocumentedChanges) {
  console.error(`${errorPrefix}${formatUndocumentedChange(change)}`);
}

process.exit(1);

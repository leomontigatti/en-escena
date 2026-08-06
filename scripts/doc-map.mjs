import { readFileSync } from "node:fs";

/**
 * Pure reasoning for the documentation gate (#630), shared by the CI check
 * (scripts/check-doc-map.mjs) and the self-check test that keeps the map from
 * rotting (app/lib/shared/domain-docs.test.ts).
 *
 * The gate asks one question: did this PR *consider* the current-state document
 * for the code it changed? It never inspects prose — asserting that a document
 * contains particular sentences enforces stability, which is the opposite of
 * freshness and is exactly what held the stale Supabase story in place (#625,
 * #626). So the unit of enforcement is the *act of changing the file*, and a
 * reasoned "no" is a legitimate answer, spelled as a commit trailer.
 *
 * The map lives in JSON rather than a TS module so the gate job can run on
 * plain `node` with no `pnpm install`. Nothing type-checks it; the self-check
 * test is what constrains it.
 *
 * @typedef {{ doc: string; code: string[] }} DocMapEntry
 * @typedef {{ doc: string; codeFiles: string[] }} UndocumentedChange
 */

export const DOC_MAP_PATH = "app/lib/shared/doc-map.json";

export const DOC_CHANGE_NOT_NEEDED_TRAILER = "Doc-Change-Not-Needed";

/**
 * Test files never alter documented behaviour, and firing on them is the
 * fastest way to train reflexive escape-hatch use: two of the eight historical
 * hits measured in #630 were test-only.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isExcludedFromDocGate(filePath) {
  return (
    filePath.endsWith(".test.ts") ||
    filePath.endsWith(".test.tsx") ||
    filePath.endsWith(".test-support.ts")
  );
}

/**
 * @param {string} contents
 * @returns {DocMapEntry[]}
 */
export function parseDocMap(contents) {
  const parsed = /** @type {DocMapEntry[]} */ (JSON.parse(contents));

  if (!Array.isArray(parsed)) {
    throw new Error(
      `${DOC_MAP_PATH} must be an array of { doc, code } entries`,
    );
  }

  return parsed;
}

/**
 * @param {string} path
 * @returns {DocMapEntry[]}
 */
export function readDocMap(path = DOC_MAP_PATH) {
  return parseDocMap(readFileSync(path, "utf8"));
}

/**
 * Supports both globs and individual files, because storage code does not live
 * in one directory: the contract in docs/operations/infrastructure.md is
 * enforced partly from `app/lib/storage/` and partly from a single module under
 * `app/lib/portal/`.
 *
 * @param {string} filePath
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchesCodePattern(filePath, pattern) {
  const source = pattern
    .split("**")
    .map((segment) =>
      segment
        .split("*")
        .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");

  return new RegExp(`^${source}$`).test(filePath);
}

/**
 * The directory a pattern is rooted at, for callers that need to list
 * candidates without walking the whole repo.
 *
 * @param {string} pattern
 * @returns {string}
 */
export function staticPrefixOf(pattern) {
  const [beforeWildcard] = pattern.split("*");

  return beforeWildcard.replace(/\/[^/]*$/, "");
}

/**
 * @param {{ docMap: DocMapEntry[]; changedFiles: string[] }} input
 * @returns {UndocumentedChange[]}
 */
export function findUndocumentedChanges({ docMap, changedFiles }) {
  const gatedFiles = changedFiles.filter(
    (filePath) => !isExcludedFromDocGate(filePath),
  );

  return docMap.flatMap((entry) => {
    if (changedFiles.includes(entry.doc)) {
      return [];
    }

    const codeFiles = gatedFiles.filter((filePath) =>
      entry.code.some((pattern) => matchesCodePattern(filePath, pattern)),
    );

    return codeFiles.length === 0 ? [] : [{ doc: entry.doc, codeFiles }];
  });
}

/**
 * A trailer rather than a label or a PR-body directive: `ci.yml` is
 * `on: pull_request` with the default types, so labelling does not re-run CI
 * and the PR would stay red. A trailer is captured at push time, forces an
 * articulated reason instead of a click, and stays auditable afterwards —
 * `squash_merge_commit_message` is `COMMIT_MESSAGES` here, so it survives the
 * squash and `git log --grep` finds every use.
 *
 * @param {string} commitMessages
 * @returns {string[]}
 */
export function findDocChangeNotNeededReasons(commitMessages) {
  return [
    ...commitMessages.matchAll(
      new RegExp(`^${DOC_CHANGE_NOT_NEEDED_TRAILER}:[ \\t]*(\\S.*)$`, "gm"),
    ),
  ].map(([, reason]) => reason.trim());
}

/**
 * Self-contained and prescriptive on purpose: both humans and AFK runners read
 * it, and a runner holds no GitHub token, so whatever this message does not say
 * is unavailable to whoever has to act on it. Single line, because a `::error::`
 * annotation keeps only its first line — anything after a newline is dropped
 * from the PR page, which is the one place this has to be readable.
 *
 * @param {UndocumentedChange} change
 * @returns {string}
 */
export function formatUndocumentedChange({ doc, codeFiles }) {
  return (
    `${doc} was not changed, but the code it documents was: ${codeFiles.join(", ")}. ` +
    `Update ${doc}, or state why it does not need updating with a commit trailer on any commit in the PR, written exactly as ` +
    `"${DOC_CHANGE_NOT_NEEDED_TRAILER}: <reason>". ` +
    `The gate asks whether the document was considered; a reasoned "no" is a legitimate answer.`
  );
}

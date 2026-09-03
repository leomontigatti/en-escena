import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

// One directory walk for the guardrails that scan the tree.
//
// Every guardrail under `scripts/` needs the same recursive listing and differs
// only in which file names it keeps, so each one had grown its own copy —
// enough of them that `fallow dupes` reports the walk as a clone group. The
// duplication is harmless on its own; what it costs is that the next guardrail
// starts by copying a walk rather than by saying which files it cares about.

type CollectSourceFilesOptions = {
  directoryPath: string;
  /** Keep this file. Receives the file name, not the path. */
  keeps: (fileName: string) => boolean;
};

/**
 * A nested checkout: a git worktree carries a `.git` file pointing at the real
 * gitdir, a clone carries a `.git` directory. Either way the tree below it
 * belongs to another checkout and is not this repo's source.
 *
 * This repo keeps its worktrees at `.claude/worktrees/<name>`, inside the
 * directory the doc scan walks, so without this the guardrail reads a whole
 * second copy of the repo at whatever commit that worktree sits on. It reported
 * 262 findings against a colleague's branch and none against the tree it was
 * asked about — worse than reporting nothing, because it fails the pre-commit
 * hook over work that is not yours. CI never saw it, since a fresh clone has no
 * worktrees, and the scan-root test could not: it derives from `git ls-files`,
 * and git does not list a nested checkout's files.
 */
function isNestedCheckout(directoryPath: string): boolean {
  return existsSync(path.join(directoryPath, ".git"));
}

export function collectSourceFiles(
  options: CollectSourceFilesOptions,
): string[] {
  return readdirSync(options.directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(options.directoryPath, entry.name);

      if (entry.isDirectory()) {
        return entry.name === "node_modules" || isNestedCheckout(entryPath)
          ? []
          : collectSourceFiles({ ...options, directoryPath: entryPath });
      }

      return options.keeps(entry.name) ? [entryPath] : [];
    },
  );
}

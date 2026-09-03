import { readdirSync } from "node:fs";
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

export function collectSourceFiles(
  options: CollectSourceFilesOptions,
): string[] {
  return readdirSync(options.directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(options.directoryPath, entry.name);

      if (entry.isDirectory()) {
        return entry.name === "node_modules"
          ? []
          : collectSourceFiles({ ...options, directoryPath: entryPath });
      }

      return options.keeps(entry.name) ? [entryPath] : [];
    },
  );
}

// Diff-anchor validation (spec §3.8, "Input tolerance").
//
// Models hallucinate inline-comment anchors. We parse `git diff master...HEAD`
// into a map of path → set of RIGHT-side line numbers that actually appear in a
// hunk, and drop any inline comment whose path:line isn't there.

/** Build path → set of commentable RIGHT-side line numbers from a unified diff. */
export function parseDiffAnchors(diff: string): Map<string, Set<number>> {
  const anchors = new Map<string, Set<number>>();
  let currentPath: string | undefined;
  let newLine = 0;

  for (const line of diff.split("\n")) {
    // New-side path of the file under change.
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim();
      currentPath = raw === "/dev/null" ? undefined : raw.replace(/^b\//, "");
      if (currentPath && !anchors.has(currentPath)) {
        anchors.set(currentPath, new Set());
      }
      continue;
    }

    // Hunk header: @@ -old,len +new,len @@ — reset the new-side counter.
    if (line.startsWith("@@")) {
      const match = /\+(\d+)/.exec(line);
      newLine = match ? Number(match[1]) : 0;
      continue;
    }

    if (!currentPath || newLine === 0) continue;

    // Body lines: '+' added and ' ' context both sit on the new side and are
    // commentable; '-' deleted lines only advance the old side.
    if (line.startsWith("+")) {
      anchors.get(currentPath)?.add(newLine);
      newLine++;
    } else if (line.startsWith(" ")) {
      anchors.get(currentPath)?.add(newLine);
      newLine++;
    }
    // '-' and metadata lines: no new-side advance.
  }

  return anchors;
}

/** True when `path:line` is anchorable in the diff. */
export function isAnchorInDiff(
  anchors: Map<string, Set<number>>,
  path: string,
  line: number,
): boolean {
  return anchors.get(path)?.has(line) ?? false;
}

import { describe, expect, it } from "vitest";

import {
  stepRunBody,
  workflowFiles,
  workflowSteps,
  workflowText,
} from "./pr-workflows.test-support";

// #1027. Four workflow steps carry the PAT-or-fallback pair (§3.4): try the
// write with `AGENT_PAT`, whose events are the only ones that re-trigger another
// workflow, and fall back to `github.token`, which lands the label but wakes
// nothing. The block is duplicated on purpose — these are inline `run:` bodies
// so they come from the base ref rather than from a PR-controlled checkout — and
// #1026 fixed the same hole in one copy while #1027 found it still open in two
// others. This file is what makes fixing one and not the rest a red test.
//
// Two shapes, deliberately:
//
//  - the *loop* shape, which walks a list of items and must survive one it
//    cannot write to; its copies are held to being byte-identical once the item
//    and label names are normalised away;
//  - the *single-item* shape, which has one write to make and ends the step with
//    it. Its two copies differ in the endpoint they call, so they are held to the
//    properties instead.
//
// Both the census of copies and the shape each one belongs to are read off disk,
// so a fifth copy is held to the assertions of its own shape without anyone
// remembering to register it. The two `toEqual` censuses below are the exception,
// and are meant to be: adding a copy should make somebody say so out loud.

/** The step-level marker: the block is exactly the code that tries `AGENT_PAT`. */
const PAT_WRITE = 'GH_TOKEN="$AGENT_PAT"';

interface Copy {
  workflow: string;
  step: string;
  body: string;
}

/** Every step in every workflow whose `run:` body attempts a write as the PAT. */
function patFallbackCopies(): Copy[] {
  return workflowFiles().flatMap((workflow) => {
    if (!workflowText(workflow).includes(PAT_WRITE)) return [];
    return workflowSteps(workflow).flatMap((step) => {
      let body: string;
      try {
        body = stepRunBody(workflow, step.name);
      } catch {
        // A step that runs an action rather than a script has no body to read.
        return [];
      }
      return body.includes(PAT_WRITE)
        ? [{ workflow, step: step.name, body }]
        : [];
    });
  });
}

/** Where the fallback block starts: the `set +e` that makes a refusal survivable. */
function blockStart(lines: string[]): number {
  const start = lines.indexOf("set +e");
  expect(start, "no `set +e` opening the fallback block").toBeGreaterThan(-1);
  return start;
}

/**
 * Whether the block sits inside a `for`/`while` loop, by counting the `do`s the
 * script has left open by the time it reaches the block.
 *
 * Asking the shell's own nesting is what makes the classification independent of
 * how the copy *handles* a refusal: a new loop copy that forgot to `continue` —
 * the #1027 bug in its loop half — is still recognised as loop-shaped, and so
 * still faces the assertions that would catch it. Keying on `continue` instead
 * would let exactly that copy slip into the single-item bucket.
 *
 * The prose openers are `…; do` and a `do` on its own line; `done` closes,
 * whatever trails it (`done | wc -l)`).
 */
function insideLoop(lines: string[]): boolean {
  let depth = 0;
  for (const line of lines.slice(0, blockStart(lines))) {
    if (/(^|;)\s*do$/.test(line)) depth++;
    if (line.startsWith("done")) depth--;
  }
  return depth > 0;
}

function isLoopShaped(body: string): boolean {
  return insideLoop(body.split("\n").map((line) => line.trim()));
}

/** The loop-shaped copies expected on disk today — a census, not the classifier. */
const EXPECTED_LOOP_SHAPED = [
  ".github/workflows/agent-label-behind-prs.yml",
  ".github/workflows/agent-promote-queued.yml",
];

/**
 * The fallback block as a comparable skeleton: from the `set +e` that opens it
 * to the end of the step, with comments and blank lines dropped, the item and
 * label identifiers renamed to placeholders, and every `echo` collapsed to
 * whether it announces an error or not.
 *
 * What survives is the control flow — which is the thing that must not drift.
 * The wording of the messages is each workflow's own.
 */
function skeleton(body: string): string[] {
  const lines = body.split("\n").map((line) => line.trim());

  return lines
    .slice(blockStart(lines))
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      if (line.startsWith("echo ")) {
        return line.includes("::error::") ? "echo ERROR" : "echo MESSAGE";
      }
      return line
        .replace(/gh (pr|issue) edit "\$(pr|Y)"/, "gh edit ITEM")
        .replace(/\$\{?(pr|Y)\}?\b/g, "ITEM")
        .replace(/agent:(update-branch|implement)/g, "LABEL")
        .replace(/\b(labeled|promoted)\b/g, "status")
        .replace(/\b(unlabelled|unpromoted)\b/g, "failed");
    });
}

/**
 * Whether the PAT write's exit status is read at all. Three spellings ship, and
 * all three are honest: `… && exit 0` reads it inline, while the others read
 * `$?` on one of the lines that follow — the `gh` call itself is wrapped across
 * two lines in some copies, so the read is not always the very next one.
 */
function readsPatStatus(body: string): boolean {
  const lines = body.split("\n").map((line) => line.trim());
  const write = lines.findIndex((line) => line.includes(PAT_WRITE));

  if (lines[write].includes("&&")) return true;
  return lines
    .slice(write + 1, write + 4)
    .some(
      (line) => /^\w+=\$\?$/.test(line) || /^if \[ \$\? -eq 0 \]/.test(line),
    );
}

describe("the PAT-or-fallback block shipped in the AFK workflows", () => {
  const copies = patFallbackCopies();

  it("finds every copy of the block", () => {
    // Chain to Review (agent-implement), the chain re-label (agent-implement-prd),
    // the behind-PR labelling (#1026) and the queued promotion (#1027).
    expect(copies.map(({ workflow }) => workflow).sort()).toEqual([
      ".github/workflows/agent-implement-prd.yml",
      ".github/workflows/agent-implement.yml",
      ".github/workflows/agent-label-behind-prs.yml",
      ".github/workflows/agent-promote-queued.yml",
    ]);
  });

  it.each(
    copies.map((copy) => [`${copy.workflow} → ${copy.step}`, copy] as const),
  )("%s reads the status of the PAT write", (_label, copy) => {
    // `set +e` is what makes the refusal survivable; without reading `$?`
    // afterwards it is also what makes it invisible.
    expect(readsPatStatus(copy.body)).toBe(true);
  });

  it.each(
    copies.map((copy) => [`${copy.workflow} → ${copy.step}`, copy] as const),
  )(
    "%s reads the status of the github.token fallback and names a refusal",
    (_label, copy) => {
      // The hole #1027 was filed for: the fallback ran under `set +e`, its exit
      // status was dropped on the floor, and the step reported success anyway.
      const fallback = copy.body.slice(
        copy.body.lastIndexOf('GH_TOKEN="$GITHUB_TOKEN"'),
      );
      expect(fallback, "the fallback's exit status is never read").toMatch(
        /^\s*\w+=\$\?$/m,
      );
      expect(fallback, "a refused write is not named with ::error::").toContain(
        "::error::",
      );
    },
  );

  it.each(
    copies.map((copy) => [`${copy.workflow} → ${copy.step}`, copy] as const),
  )("%s survives an unset AGENT_PAT under set -u", (_label, copy) => {
    expect(copy.body).toContain('if [ -n "${AGENT_PAT:-}" ]; then');
  });
});

describe("the loop-shaped copies do not drift apart", () => {
  const copies = patFallbackCopies().filter((copy) => isLoopShaped(copy.body));

  it("finds every loop-shaped copy", () => {
    expect(copies.map(({ workflow }) => workflow).sort()).toEqual(
      [...EXPECTED_LOOP_SHAPED].sort(),
    );
  });

  it.each(copies.slice(1).map((copy) => [copy.workflow, copy] as const))(
    "%s handles a refused write exactly as the others do",
    (_label, copy) => {
      // Fixing one copy and leaving another behind is precisely how #1027
      // happened: #1026 repaired the labelling workflow and the promotion
      // workflow kept swallowing the same refusal for another release.
      expect(skeleton(copy.body)).toEqual(skeleton(copies[0].body));
    },
  );

  it.each(copies.map((copy) => [copy.workflow, copy] as const))(
    "%s carries on to the next item and fails the run at the end",
    (_label, copy) => {
      const skel = skeleton(copy.body);
      expect(skel).toContain("continue");
      expect(skel).toContain("exit 1");
      // The `::error::` names the item *before* the loop moves on, so the item
      // that could not be written is in the log even when others succeed.
      expect(skel.indexOf("echo ERROR")).toBeLessThan(skel.indexOf("continue"));
    },
  );

  // The classifier is the part of this file a fifth copy depends on, so it gets
  // tested on a copy that does not exist: the #1027 bug in its loop half, which
  // reads both statuses and names the refusal but abandons the rest of the list.
  // It has to land in the bucket above — reading `$?` is not what makes a loop
  // copy correct, and a classifier keyed on `continue` would excuse it.
  const regressedLoopCopy = [
    "for item in $items; do",
    "  set +e",
    "  status=1",
    '  if [ -n "${AGENT_PAT:-}" ]; then',
    '    GH_TOKEN="$AGENT_PAT" gh issue edit "$item" --add-label "agent:implement"',
    "    status=$?",
    "  fi",
    '  if [ "$status" -ne 0 ]; then',
    '    GH_TOKEN="$GITHUB_TOKEN" gh issue edit "$item" --add-label "agent:implement"',
    "    status=$?",
    "  fi",
    "  set -e",
    '  if [ "$status" -ne 0 ]; then',
    '    echo "::error::Could not label #$item."',
    "    exit 1",
    "  fi",
    "done",
  ].join("\n");

  it("classifies a loop copy that abandons the list as loop-shaped", () => {
    expect(isLoopShaped(regressedLoopCopy)).toBe(true);
  });

  it("would report such a copy as drifted", () => {
    expect(skeleton(regressedLoopCopy)).not.toEqual(skeleton(copies[0].body));
    expect(skeleton(regressedLoopCopy)).not.toContain("continue");
  });
});

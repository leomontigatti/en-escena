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
// Everything is discovered from disk: a fifth copy added later lands in the
// table by existing, not by someone remembering to extend it.

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

/**
 * The copies that walk a list. `continue` is what distinguishes them: only a
 * loop can choose to carry on past an item it failed to write.
 */
const LOOP_SHAPED = [
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
  const start = lines.indexOf("set +e");
  expect(start, "no `set +e` opening the fallback block").toBeGreaterThan(-1);

  return lines
    .slice(start)
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
    expect(copy.body).toMatch(
      /GH_TOKEN="\$AGENT_PAT"[^\n]*(\n[^\n]*)?\n\s*(\w+=\$\?|if \[ \$\? -eq 0 \])|GH_TOKEN="\$AGENT_PAT"[^\n]*&&/,
    );
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
  const copies = patFallbackCopies().filter((copy) =>
    LOOP_SHAPED.includes(copy.workflow),
  );

  it("finds both of them", () => {
    expect(copies.map(({ workflow }) => workflow).sort()).toEqual(
      [...LOOP_SHAPED].sort(),
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
});

import { describe, expect, it } from "vitest";

import { workflowFiles, workflowText } from "./pr-workflows.test-support";

// Coverage for #956: the agent session runs inside the checked-out tree and
// reads issue and PR text, so nothing it can reach may hold a GitHub credential.
// `actions/checkout` persists the token it fetched with into `.git/config` by
// default, so every checkout in this directory has to opt out. The pre-session
// guard and the race-safe push that used to be tested here left with the
// label-triggered runners that shipped them (ADR-0016).

/**
 * Every line naming the action, however its `uses:` is spelled. The block
 * parser below matches a stricter shape, and this is what makes a checkout it
 * cannot see a failure rather than a silent gap in the audit.
 */
function checkoutMentions(file: string): number {
  return workflowText(file)
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && line.includes("actions/checkout@"))
    .length;
}

const CHECKOUT_USES = /^\s+(- )?uses: actions\/checkout@/;

function indentOf(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

/**
 * Whether `line` has left the step whose `uses:` sits at `indent`. A list item
 * *below* that indentation is a value inside the step (a `sparse-checkout:`
 * entry, say); one at or above it is the next step.
 */
function leavesStep(line: string, indent: number): boolean {
  const depth = indentOf(line);
  if (depth < indent) return true;
  return depth <= indent && /^\s*- /.test(line);
}

/** The lines nested under the step starting at `start`, blank ones dropped. */
function stepBody(lines: string[], start: number): string {
  const indent = indentOf(lines[start]);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (leavesStep(line, indent)) break;
    body.push(line);
  }
  return body.join("\n");
}

/** Every `- uses: actions/checkout@…` step block, as the text of its `with:` lines. */
function checkoutBlocks(file: string): string[] {
  const lines = workflowText(file).split("\n");
  return lines
    .map((line, i) => (CHECKOUT_USES.test(line) ? stepBody(lines, i) : null))
    .filter((block) => block !== null);
}

describe("no checkout persists a credential (#956)", () => {
  it("sets persist-credentials: false on every actions/checkout in every workflow", () => {
    let seen = 0;
    let mentioned = 0;
    for (const file of workflowFiles()) {
      mentioned += checkoutMentions(file);
      for (const block of checkoutBlocks(file)) {
        seen += 1;
        expect(
          block,
          `${file}: a checkout without \`persist-credentials: false\` leaves its token in .git/config`,
        ).toMatch(/^\s+persist-credentials: false\s*$/m);
        expect(
          block,
          `${file}: a checkout \`token:\` only matters when it is persisted; push steps authenticate per command`,
        ).not.toMatch(/^\s+token:/m);
      }
    }
    // The audit is only meaningful if it saw every checkout there is.
    expect(mentioned).toBeGreaterThan(0);
    expect(seen).toBe(mentioned);
  });
});

describe("every checkout can actually clone what it checks out (#1029)", () => {
  // `permissions:` is deny-by-default once declared: a block that names any
  // scope sets every scope it *omits* to `none`. A workflow that lists only the
  // write it makes — `issues: write`, `pull-requests: write` — therefore hands
  // `actions/checkout` a token with `contents: none`, and the clone 403s before
  // the step that needed the tree ever runs. #1029 added a checkout to two such
  // workflows to put `scripts/afk-add-label.sh` on disk, which is how the rule
  // earned a test rather than a review comment.
  it("declares contents: in every workflow that checks out", () => {
    const offenders = workflowFiles().filter((file) => {
      if (checkoutBlocks(file).length === 0) return false;
      const text = workflowText(file);
      const declared = /^permissions:\n((?: {2}.*\n)+)/m.exec(text)?.[1];
      // No block at all means the default token, which carries `contents: read`.
      if (declared === undefined) return false;
      return !/^ {2}contents:/m.test(declared);
    });

    expect(
      offenders,
      "a declared `permissions:` block omitting `contents:` gives actions/checkout no read access",
    ).toEqual([]);
  });
});

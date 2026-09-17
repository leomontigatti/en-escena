import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { workflowText } from "./pr-workflows.test-support";

// Coverage for #956: the agent session runs inside the checked-out tree and
// reads issue and PR text, so nothing it can reach may hold a GitHub credential.
// `actions/checkout` persists the token it fetched with into `.git/config` by
// default; every checkout in this directory has to opt out, and the steps that
// push authenticate per command instead (docs/agents/afk-setup.md → "Where the
// PAT is during a run"). Discovered from disk, not listed: a new workflow that
// forgets the flag fails here rather than shipping a persisted token.

const dir = ".github/workflows";
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function workflows(): string[] {
  return readdirSync(`${repoRoot}${dir}`)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `${dir}/${name}`)
    .sort();
}

/** Every `- uses: actions/checkout@…` step block, as the text of its `with:` lines. */
function checkoutBlocks(file: string): string[] {
  const lines = workflowText(file).split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const isCheckout = (line: string): boolean =>
      /^\s+(- )?uses: actions\/checkout@/.test(line);
    if (!isCheckout(lines[i])) continue;
    const indent = /^\s*/.exec(lines[i])?.[0].length ?? 0;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") continue;
      const depth = /^\s*/.exec(line)?.[0].length ?? 0;
      // The step ends at the next step or at anything not nested under it.
      if (/^\s+- /.test(line) || depth < indent) break;
      block.push(line);
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

describe("no checkout persists a credential (#956)", () => {
  it("sets persist-credentials: false on every actions/checkout in every workflow", () => {
    let seen = 0;
    for (const file of workflows()) {
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
    // The audit is only meaningful if it found the checkouts it exists for.
    expect(seen).toBeGreaterThanOrEqual(9);
  });

  it("asserts an empty extraheader before every agent session", () => {
    // The workflows that run an agent on the checked-out tree after configuring
    // a git identity: each carries the runtime form of the invariant.
    for (const file of workflows()) {
      const text = workflowText(file);
      if (!/git config user\.name "claude-code\[bot\]"/.test(text)) continue;
      expect(
        text,
        `${file}: the identity step must refuse to start the agent over a persisted credential`,
      ).toContain("git config --get-all http.https://github.com/.extraheader");
    }
  });
});

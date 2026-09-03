import { beforeEach, describe, expect, it, vi } from "vitest";

import { workflowText } from "./pr-workflows.test-support";

// Coverage for #790: `buildReviewContext` used to *throw* when the PR body had
// no `closes/fixes/resolves #N`, and both callers (review, implement-pr) hit
// that on their first prefetch call — after the label transition, the checkout
// and the installs. The linked issue is now optional here: the refusal, where
// one is warranted, belongs in `agent-review.yml`'s preflight, and implement-pr
// (which only shows the issue "for context only") carries on without it.

const gh = vi.hoisted(() => vi.fn<(args: string[]) => string>());
const execFileSync = vi.hoisted(() => vi.fn<(...args: unknown[]) => string>());

vi.mock("../../.sandcastle/lib/gh.mjs", () => ({ gh }));
vi.mock("node:child_process", () => ({ execFileSync }));

const { buildReviewContext } =
  await import("../../.sandcastle/agent-review/context.mjs");

const EMPTY_THREADS = JSON.stringify({
  data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } },
});

/** A `gh` stub answering each prefetch call, driven by the argv it receives. */
function stubGh(prBody: string): void {
  gh.mockImplementation((args) => {
    if (args[0] === "pr" && args[1] === "view") return prBody;
    if (args[0] === "issue") return JSON.stringify({ title: "T", body: "B" });
    if (args[0] === "api" && args[1] === "graphql") return EMPTY_THREADS;
    if (args[0] === "api" && args[2]?.includes("/sub_issues")) return "[]";
    return "[]";
  });
}

beforeEach(() => {
  gh.mockReset();
  execFileSync.mockReset();
  execFileSync.mockImplementation((_cmd, args) =>
    (args as string[]).includes("--stat") ? " app/x.ts | 2 +-" : "diff --git …",
  );
});

describe("buildReviewContext with no linked issue", () => {
  it("returns a null issue instead of throwing", () => {
    stubGh("A PR body that links nothing at all.");

    const context = buildReviewContext("owner/repo", "790");

    expect(context.issueNumber).toBeNull();
    expect(context.issueTitle).toBeNull();
    expect(context.issueBody).toBeNull();
  });

  it("still returns the diff, the --stat and PR_COMMENTS_JSON", () => {
    stubGh("No linked issue here.");

    const context = buildReviewContext("owner/repo", "790");

    expect(context.diff).toBe("diff --git …");
    expect(context.diffStat).toBe(" app/x.ts | 2 +-");
    expect(JSON.parse(context.prCommentsJson)).toEqual({
      issue_comments: [],
      review_summaries: [],
      review_threads: [],
    });
    expect(context.subIssues).toBe("");
  });

  it("never asks GitHub for an issue or its sub-issues", () => {
    stubGh("Nothing linked.");

    buildReviewContext("owner/repo", "790");

    const calls = gh.mock.calls.map(([args]) => args.join(" "));
    expect(calls.some((call) => call.startsWith("issue view"))).toBe(false);
    expect(calls.some((call) => call.includes("/sub_issues"))).toBe(false);
  });

  it("still reads the linked issue when the PR body has one", () => {
    stubGh("Fixes #123 — the real thing.");

    const context = buildReviewContext("owner/repo", "790");

    expect(context.issueNumber).toBe("123");
    expect(context.issueTitle).toBe("T");
    expect(context.issueBody).toBe("B");
  });
});

// The rule "does this PR body link an issue?" is now written twice, in two
// languages: as a `jq` regex in `agent-review.yml`'s preflight and as a JS one
// inside `parseLinkedIssue`. They have to agree — a body the preflight accepts
// and the parser rejects reaches the runner with a null issue and throws after
// the installs, which is the exact waste #790 removed; the converse silently
// refuses a PR that does link an issue. Nothing but this test couples them.
describe("the preflight regex and the runner parser agree", () => {
  /** The regex the preflight's `jq test(...)` uses, as a JS `RegExp`. */
  function preflightPattern(): RegExp {
    const yaml = workflowText(".github/workflows/agent-review.yml");
    const match = /test\("([^"]+)";\s*"i"\)/.exec(yaml);
    if (!match) throw new Error("agent-review.yml: no linked-issue jq test()");
    // jq reads the YAML's `\\s` as the regex `\s`; JS needs the same unescaping.
    return new RegExp(match[1].replace(/\\\\/g, "\\"), "i");
  }

  const BODIES = [
    "",
    "No linked issue at all.",
    "Closes #12",
    "closes #12",
    "Fixes #12",
    "RESOLVES #12",
    "Closes\n#12",
    "Closes  \t #12",
    "Closes #abc",
    "Closes: #12",
    "encloses #12",
    "Refs #12",
    "## Summary\n\n- a bullet\n\nCloses #790",
    "```\nCloses #12\n```",
    "Closes #0",
  ];

  it.each(BODIES)("decides %j the same way in both", (body) => {
    stubGh(body);

    const linkedPerRunner =
      buildReviewContext("owner/repo", "790").issueNumber !== null;

    expect(preflightPattern().test(body)).toBe(linkedPerRunner);
  });
});

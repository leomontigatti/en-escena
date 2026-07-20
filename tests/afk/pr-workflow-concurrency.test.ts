import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Regression coverage for #383: the three workflows-over-a-PR (Review,
// Implement PR, Update Branch) all listen to `pull_request_target: [labeled]`
// and share the `agent-mutate-pr-<PR>` concurrency group (spec §3.5). A single
// `labeled` event starts all three runs; the two whose label doesn't match are
// no-ops, yet — because every run entered the shared group — GitHub cancelled
// the pending sibling that *should* have run (the one in the middle of the
// queue). The fix: a run only joins the shared group when its own label is the
// one that fired; otherwise it takes a unique per-run group so it can't
// cannibalise a sibling.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

interface PrWorkflow {
  /** Path relative to the repo root. */
  file: string;
  /** The `agent:*` label that makes this workflow actually run. */
  label: string;
}

const PR_WORKFLOWS: PrWorkflow[] = [
  { file: ".github/workflows/agent-review.yml", label: "agent:review" },
  {
    file: ".github/workflows/agent-implement-pr.yml",
    label: "agent:implement",
  },
  {
    file: ".github/workflows/agent-update-branch.yml",
    label: "agent:update-branch",
  },
];

/** Evaluation context for a single `labeled` event on a PR. */
interface EventContext {
  labelName: string;
  prNumber: number;
  runId: string;
  workflow: string;
}

/**
 * Minimal evaluator for the GitHub Actions expression subset used by the
 * concurrency `group`: context lookups, string literals, `==`, short-circuit
 * `&&`/`||` (which return the operand, not a boolean), and `format(...)`.
 */
function evalGha(expr: string, ctx: EventContext): string {
  const contextValues: Record<string, string> = {
    "github.event.label.name": ctx.labelName,
    "github.event.pull_request.number": String(ctx.prNumber),
    "github.run_id": ctx.runId,
    "github.workflow": ctx.workflow,
  };

  const inner = expr
    .trim()
    .replace(/^\$\{\{/, "")
    .replace(/\}\}$/, "")
    .trim();

  type Value = string | boolean;
  const truthy = (v: Value): boolean => v !== false && v !== "" && v !== "0";

  let pos = 0;
  const rest = () => inner.slice(pos);
  const skipWs = () => {
    while (pos < inner.length && /\s/.test(inner[pos])) pos++;
  };

  const parsePrimary = (): Value => {
    skipWs();
    if (rest().startsWith("(")) {
      pos++; // (
      const v = parseOr();
      skipWs();
      pos++; // )
      return v;
    }
    if (inner[pos] === "'") {
      pos++;
      let s = "";
      while (inner[pos] !== "'") s += inner[pos++];
      pos++;
      return s;
    }
    const fmt = /^format\(\s*'([^']*)'\s*((?:,\s*[^,)]+\s*)*)\)/.exec(rest());
    if (fmt) {
      pos += fmt[0].length;
      const template = fmt[1];
      const args = fmt[2]
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .map((a) => String(resolveToken(a, contextValues)));
      return template.replace(/\{(\d+)\}/g, (_m, i) => args[Number(i)]);
    }
    const token = /^[A-Za-z0-9_.]+/.exec(rest());
    if (!token) throw new Error(`Cannot parse near: ${rest()}`);
    pos += token[0].length;
    return resolveToken(token[0], contextValues);
  };

  const parseComparison = (): Value => {
    let left = parsePrimary();
    skipWs();
    if (rest().startsWith("==")) {
      pos += 2;
      const right = parsePrimary();
      left = String(left) === String(right);
    }
    return left;
  };

  const parseAnd = (): Value => {
    let left = parseComparison();
    skipWs();
    while (rest().startsWith("&&")) {
      pos += 2;
      const right = parseComparison();
      left = truthy(left) ? right : left;
    }
    return left;
  };

  function parseOr(): Value {
    let left = parseAnd();
    skipWs();
    while (rest().startsWith("||")) {
      pos += 2;
      const right = parseAnd();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  return String(parseOr());
}

function resolveToken(
  token: string,
  contextValues: Record<string, string>,
): string {
  if (token in contextValues) return contextValues[token];
  throw new Error(`Unknown context token: ${token}`);
}

function concurrencyBlock(file: string): string {
  const text = readFileSync(`${repoRoot}${file}`, "utf8");
  const block = /^concurrency:\n((?:[ \t]+.*\n?)+)/m.exec(text);
  if (!block) throw new Error(`${file}: no concurrency block`);
  return block[1];
}

function concurrencyGroup(file: string): string {
  const block = concurrencyBlock(file);
  const match = /^[ \t]+group:[ \t]*(.+?)[ \t]*$/m.exec(block);
  if (!match) throw new Error(`${file}: no concurrency.group`);
  return match[1].replace(/^["']|["']$/g, "");
}

function cancelInProgress(file: string): string {
  const block = concurrencyBlock(file);
  const match = /^[ \t]+cancel-in-progress:[ \t]*(\S+)[ \t]*$/m.exec(block);
  if (!match) throw new Error(`${file}: no cancel-in-progress`);
  return match[1];
}

describe("PR-mutating workflows concurrency (#383)", () => {
  it("keeps cancel-in-progress false on all three (spec §3.5)", () => {
    for (const { file } of PR_WORKFLOWS) {
      expect(cancelInProgress(file)).toBe("false");
    }
  });

  it("a labeled event only makes the matching workflow join the shared group", () => {
    const prNumber = 381;

    for (const fired of PR_WORKFLOWS) {
      // Simulate the single `labeled` event that adds `fired.label`: all three
      // workflows start and each computes its concurrency group.
      const groups = PR_WORKFLOWS.map((wf, i) => {
        const raw = concurrencyGroup(wf.file);
        return evalGha(raw, {
          labelName: fired.label,
          prNumber,
          runId: `run-${i}`,
          workflow: wf.file,
        });
      });

      const shared = `agent-mutate-pr-${prNumber}`;

      // Exactly one run — the workflow whose label fired — joins the shared
      // group. If a no-op sibling also joined it, GitHub would cancel the
      // pending real run (the #383 bug).
      const joiners = groups.filter((g) => g === shared);
      expect(joiners).toHaveLength(1);

      // The no-op siblings each get a distinct group, so none can cancel
      // another via the shared queue.
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("preserves real mutual exclusion: two genuinely-running siblings share the group (spec §3.5)", () => {
    const prNumber = 381;

    // Review is mid-run (event fired `agent:review`); then Implement PR is
    // dispatched (its own `agent:implement` event). Both are real runs and must
    // land in the same shared group so they serialise, never race the branch.
    const reviewGroup = evalGha(
      concurrencyGroup(".github/workflows/agent-review.yml"),
      { labelName: "agent:review", prNumber, runId: "r1", workflow: "review" },
    );
    const implementGroup = evalGha(
      concurrencyGroup(".github/workflows/agent-implement-pr.yml"),
      {
        labelName: "agent:implement",
        prNumber,
        runId: "r2",
        workflow: "implement",
      },
    );

    expect(reviewGroup).toBe(`agent-mutate-pr-${prNumber}`);
    expect(implementGroup).toBe(`agent-mutate-pr-${prNumber}`);
    expect(reviewGroup).toBe(implementGroup);
  });
});

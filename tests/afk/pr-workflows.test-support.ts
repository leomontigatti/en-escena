import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Shared reading + evaluation helpers for the three workflows-over-a-PR. Both
// `pr-workflow-concurrency.test.ts` (#383) and `pr-workflow-fork-guard.test.ts`
// (#635) assert a property across the same table, and both need to evaluate a
// GitHub Actions expression rather than match its spelling: the property is what
// the condition *decides*, not how it is written.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface PrWorkflow {
  /** Path relative to the repo root. */
  file: string;
  /** The `agent:*` label that makes this workflow actually run. */
  label: string;
}

/**
 * The workflows that run over an existing PR on `pull_request_target: [labeled]`,
 * paired with the label each answers to — the label is the one thing that cannot
 * be derived from the file. A fourth one added later belongs here, and
 * `forkExposedWorkflows()` is what makes forgetting to add it a test failure
 * rather than a silent coverage hole.
 */
export const PR_WORKFLOWS: PrWorkflow[] = [
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

/**
 * Minimal evaluator for the GitHub Actions expression subset used by the
 * concurrency `group` and the job-level `if`: context lookups, string literals,
 * `==`, short-circuit `&&`/`||` (which return the operand, not a boolean), and
 * `format(...)`.
 */
export function evalGha(
  expr: string,
  contextValues: Record<string, string>,
): string {
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

  const value = parseOr();
  skipWs();
  // The evaluator only covers a subset of the expression language. Anything it
  // silently walked past would mean judging a *prefix* of a security condition
  // and calling that the condition — so refuse rather than under-read.
  if (pos < inner.length)
    throw new Error(`Unsupported expression syntax near: ${rest()}`);
  return String(value);
}

function resolveToken(
  token: string,
  contextValues: Record<string, string>,
): string {
  if (token in contextValues) return contextValues[token];
  throw new Error(`Unknown context token: ${token}`);
}

function workflowText(file: string): string {
  return readFileSync(`${repoRoot}${file}`, "utf8");
}

/** The top-level block under a key, i.e. every line indented beneath it. */
function topLevelBlock(file: string, key: string): string | undefined {
  const block = new RegExp(`^${key}:\\n((?:[ \\t]+.*\\n?|\\n)+)`, "m").exec(
    workflowText(file),
  );
  return block?.[1];
}

/**
 * Every workflow whose head-of-PR checkout is reachable with this repo's
 * secrets: triggered by `pull_request_target` (which runs privileged) *and*
 * checking out a ref derived from `pull_request.head` (which is the PR author's
 * tree). This is derived from disk rather than listed, so a new workflow of that
 * shape is covered by #635's guard test the moment it lands.
 */
export function forkExposedWorkflows(): string[] {
  const dir = ".github/workflows";
  return readdirSync(`${repoRoot}${dir}`)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `${dir}/${name}`)
    .filter((file) => {
      // Scoped to the `on:` block: the string also appears in prose comments
      // about workflows that merely *trigger* one of these (agent-implement.yml).
      const on = topLevelBlock(file, "on");
      if (!on || !/^ {2}pull_request_target:/m.test(on)) return false;
      return /^[ \t]*ref:.*github\.event\.pull_request\.head\./m.test(
        workflowText(file),
      );
    })
    .sort();
}

function concurrencyBlock(file: string): string {
  const block = topLevelBlock(file, "concurrency");
  if (!block) throw new Error(`${file}: no concurrency block`);
  return block;
}

export function concurrencyGroup(file: string): string {
  const block = concurrencyBlock(file);
  const match = /^[ \t]+group:[ \t]*(.+?)[ \t]*$/m.exec(block);
  if (!match) throw new Error(`${file}: no concurrency.group`);
  return match[1].replace(/^["']|["']$/g, "");
}

export function cancelInProgress(file: string): string {
  const block = concurrencyBlock(file);
  const match = /^[ \t]+cancel-in-progress:[ \t]*(\S+)[ \t]*$/m.exec(block);
  if (!match) throw new Error(`${file}: no cancel-in-progress`);
  return match[1];
}

export interface JobCondition {
  /** The job id under `jobs:`. */
  job: string;
  /** The job-level `if:`, folded to one line. */
  condition: string;
}

/**
 * Every job in the workflow paired with its job-level `if:`. A job without one
 * yields an empty condition, so a new unguarded job is visible rather than
 * silently skipped.
 */
export function jobConditions(file: string): JobCondition[] {
  const jobsBlock = topLevelBlock(file, "jobs");
  if (!jobsBlock) throw new Error(`${file}: no jobs block`);

  const lines = jobsBlock.split("\n");
  const conditions: JobCondition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const job = /^ {2}([A-Za-z0-9_-]+):[ \t]*$/.exec(lines[i]);
    if (!job) continue;

    let condition = "";
    for (let j = i + 1; j < lines.length; j++) {
      // Stop at the next job: anything indented two spaces starts a new key.
      if (/^ {2}\S/.test(lines[j])) break;
      const found = /^ {4}if:[ \t]*(.*)$/.exec(lines[j]);
      if (!found) continue;

      condition = found[1].trim();
      // Folded/literal block scalar (`>-`, `>`, `|`): the value is the
      // more-indented lines that follow, joined into one line. The continuation
      // indent is whatever the first of those lines uses — pinning a width here
      // would read a differently-indented guard as *absent*.
      if (/^[>|][-+]?$/.test(condition)) {
        const parts: string[] = [];
        for (let k = j + 1; k < lines.length; k++) {
          const indent = /^ {5,}(\S.*)$/.exec(lines[k]);
          if (!indent) break;
          parts.push(indent[1].trim());
        }
        condition = parts.join(" ");
      }
      break;
    }

    conditions.push({ job: job[1], condition });
  }

  if (conditions.length === 0) throw new Error(`${file}: no jobs found`);
  return conditions;
}

import { readFileSync } from "node:fs";
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
 * The workflows that run over an existing PR on `pull_request_target: [labeled]`.
 * A fourth one added later belongs here, which is what makes both suites cover
 * it automatically.
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

  return String(parseOr());
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

function concurrencyBlock(file: string): string {
  const block = /^concurrency:\n((?:[ \t]+.*\n?)+)/m.exec(workflowText(file));
  if (!block) throw new Error(`${file}: no concurrency block`);
  return block[1];
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
  const text = workflowText(file);
  const jobsBlock = /^jobs:\n((?:[ \t]+.*\n?|\n)+)/m.exec(text);
  if (!jobsBlock) throw new Error(`${file}: no jobs block`);

  const lines = jobsBlock[1].split("\n");
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
      // more-indented lines that follow, joined into one line.
      if (/^[>|][-+]?$/.test(condition)) {
        const parts: string[] = [];
        for (let k = j + 1; k < lines.length; k++) {
          if (!/^ {6}\S/.test(lines[k])) break;
          parts.push(lines[k].trim());
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

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Shared workflow-reading helpers for the AFK tests. They read the YAML as
// text: the repo has no YAML parser, and a raw slice runs the lines that ship.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/** The workflow file's raw text, read relative to the repo root. */
export function workflowText(file: string): string {
  return readFileSync(`${repoRoot}${file}`, "utf8");
}

/**
 * Every workflow in `.github/workflows/`, as repo-relative paths, sorted. The
 * directory is read rather than listed so an audit that scans "every workflow"
 * covers one added later without anyone extending a table.
 */
export function workflowFiles(): string[] {
  const dir = ".github/workflows";
  return readdirSync(`${repoRoot}${dir}`)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `${dir}/${name}`)
    .sort();
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
  return workflowFiles()
    .filter((file) => {
      // Scoped to the `on:` block: the string also appears in prose comments
      // about workflows that merely *trigger* one of these.
      const on = topLevelBlock(file, "on");
      if (!on || !/^ {2}pull_request_target:/m.test(on)) return false;
      return /^[ \t]*ref:.*github\.event\.pull_request\.head\./m.test(
        workflowText(file),
      );
    })
    .sort();
}

export interface WorkflowStep {
  /** The step's `name:`, or its `uses:` when it has none. */
  name: string;
  /** The step's `id:`, or `""`. */
  id: string;
  /** The step's `uses:`, or `""` when it runs a script. */
  uses: string;
  /** The step's whole YAML block, dedented to its own indentation. */
  body: string;
  /** The step-level `if:`, or `""` when it has none. */
  condition: string;
}

/**
 * Every step of every job in the workflow, in file order, paired with its
 * step-level `if:`. A step without one yields an empty condition, so a newly
 * added ungated step is visible rather than silently skipped.
 *
 * Steps are flattened across jobs: every workflow this reads is single-job
 * today, and a caller that cares about job boundaries wants `jobConditions`.
 * A workflow with no literal steps at all (a `uses:`-only reusable-workflow
 * call) yields `[]` rather than throwing — callers scan the whole directory,
 * and one such workflow added later must not break an unrelated suite.
 */
export function workflowSteps(file: string): WorkflowStep[] {
  const lines = workflowText(file).split("\n");
  const steps: WorkflowStep[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^ {6}- /.test(lines[i])) continue;

    const block = [lines[i].replace(/^ {6}- /, "        ")];
    for (let j = i + 1; j < lines.length; j++) {
      // The step ends at the next step, or at anything indented less deeply.
      if (/^ {6}- /.test(lines[j])) break;
      if (lines[j].trim() !== "" && !/^ {8}/.test(lines[j])) break;
      block.push(lines[j]);
    }

    const key = (name: string): string =>
      new RegExp(`^ {8}${name}:[ \\t]*(.*)$`, "m")
        .exec(block.join("\n"))?.[1]
        .trim() ?? "";

    steps.push({
      body: block.join("\n"),
      name: key("name") || key("uses"),
      id: key("id"),
      uses: key("uses"),
      condition: key("if"),
    });
  }

  return steps;
}

/**
 * The indices of the lines from `from` that are indented at least `indent`
 * columns, blank lines included and normalised to empty. A step's own block and
 * a `run: |` body are the same shape, so both are read with this.
 */
function indentedRun(lines: string[], from: number, indent: number): number[] {
  const found: number[] = [];
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim() !== "" && !lines[i].startsWith(" ".repeat(indent)))
      break;
    found.push(i);
  }
  return found;
}

/**
 * The `run: |` body of the step named `stepName`, dedented to column zero.
 *
 * Several tests execute the bash that *ships* — lifted out of the workflow file
 * rather than copied into the test, so the copy cannot drift green. This is the
 * reader they share. The step is found by its `name:` the way `workflowSteps()`
 * does it, not by a literal indented line: a re-indent must not turn a
 * behaviour test into "no step named …".
 */
export function stepRunBody(file: string, stepName: string): string {
  const lines = workflowText(file).split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (!/^ {6}- /.test(lines[i])) continue;

    // A step ends where the indentation does: the next `- ` step, or any key of
    // the job around it, is outdented past the step's own keys.
    const step = indentedRun(lines, i + 1, 8);
    const block = [
      lines[i].replace(/^ {6}- /, "        "),
      ...step.map((n) => lines[n]),
    ].join("\n");
    if (/^ {8}name:[ \t]*(.*)$/m.exec(block)?.[1].trim() !== stepName) continue;

    const run = step.find((n) => /^ {8,}run: \|\s*$/.test(lines[n]));
    if (run === undefined)
      throw new Error(`${file}: step \`${stepName}\` has no \`run: |\` block`);

    // The body is what is indented under the `run:` key — two columns deeper.
    const indent = lines[run].length - lines[run].trimStart().length + 2;
    return indentedRun(lines, run + 1, indent)
      .map((n) => (lines[n].trim() === "" ? "" : lines[n].slice(indent)))
      .join("\n");
  }

  throw new Error(`${file}: no step named \`${stepName}\``);
}

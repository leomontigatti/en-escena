import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Runs `pnpm typecheck`, `pnpm lint` and `pnpm test:unit` one after the other
// and prints only what failed, each failure at its file and line, then one
// summary line. Exits 1 when any step failed.
//
// Usage: pnpm gate
//
// Agents used to chain the three by hand and pipe the result into `tail`,
// which cut off the failure they were looking for. Every step runs even after
// an earlier one fails, so one run shows all three. A failing step whose output
// matches nothing below is printed whole, never trimmed.

export type StepResult = {
  name: string;
  ok: boolean;
  failures: string[];
  /** How many failures were parsed; null when the output was not understood. */
  count: number | null;
  passed?: number;
};

type AssertionResult = {
  fullName: string;
  status: string;
  failureMessages: string[];
};

type VitestReport = {
  numPassedTests: number;
  testResults: {
    name: string;
    status: string;
    message: string;
    assertionResults: AssertionResult[];
  }[];
};

// With a location (`app/a.ts(1,14): error TS2322: …`) or without one, as for
// a missing type definition file (`error TS2688: …`).
const TSC_ERROR = /^(\S.*\(\d+,\d+\): )?error TS\d+:/;
// `[Error/rule]`, or `[Error]` alone for a parse error, which has no rule.
const LINT_ERROR = /^\S+:\d+:\d+: .* \[Error[\]/]/;
const UNHANDLED_HEADER = /^⎯+ Unhandled Errors? ⎯+$/;
const SUMMARY_START = /^\s*Test Files\s/;
const STACK_FRAME = /^\s+at /;

export function typecheckFailures(output: string): string[] {
  const failures: string[] = [];
  let inError = false;

  for (const line of output.split("\n")) {
    if (TSC_ERROR.test(line)) {
      inError = true;
      failures.push(line);
    } else if (inError && /^\s+\S/.test(line)) {
      failures.push(line);
    } else {
      inError = false;
    }
  }

  return failures;
}

export function lintFailures(output: string): string[] {
  return output.split("\n").filter((line) => LINT_ERROR.test(line));
}

/**
 * The "Unhandled Errors" block of vitest's console report. The JSON report
 * leaves those errors out, though they fail the run.
 */
export function unhandledErrors(output: string): {
  lines: string[];
  count: number;
} {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => UNHANDLED_HEADER.test(line));

  if (start === -1) return { lines: [], count: 0 };

  const end = lines.findIndex(
    (line, index) => index > start && SUMMARY_START.test(line),
  );
  const block = lines.slice(start, end === -1 ? undefined : end);

  while (block.length > 0 && block.at(-1)?.trim() === "") block.pop();

  const count = Number(/^\s*Errors\s+(\d+) errors?/m.exec(output)?.[1] ?? 1);
  return { lines: block, count };
}

function relative(text: string, root: string): string {
  return text.replaceAll(`file://${root}/`, "").replaceAll(`${root}/`, "");
}

/** The `file:line:col` of the first stack frame inside the test file. */
function locate(message: string, file: string, root: string): string {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const frame = new RegExp(`${escaped}:(\\d+):(\\d+)`).exec(message);
  const name = path.relative(root, file);

  return frame ? `${name}:${frame[1]}:${frame[2]}` : name;
}

function indent(message: string, root: string): string[] {
  return relative(message, root)
    .split("\n")
    .filter((line) => !STACK_FRAME.test(line))
    .map((line) => (line ? `  ${line}` : ""));
}

export function testFailures(report: VitestReport, root: string): string[] {
  return report.testResults.flatMap((file) => {
    if (file.status !== "failed") return [];

    const failed = file.assertionResults.filter(
      (test) => test.status === "failed",
    );

    if (failed.length === 0) {
      return [
        `${path.relative(root, file.name)} › failed to run`,
        ...indent(file.message, root),
      ];
    }

    return failed.flatMap((test) => {
      const message = test.failureMessages.join("\n");

      return [
        `${locate(message, file.name, root)} › ${test.fullName}`,
        ...indent(message, root),
      ];
    });
  });
}

function summarize(step: StepResult): string {
  const passed = step.passed === undefined ? "" : ` (${step.passed} passed)`;

  if (step.ok) return `${step.name} ok${passed}`;
  if (step.count === null) return `${step.name} failed`;

  return `${step.name} ${step.count} ${step.count === 1 ? "failure" : "failures"}${passed}`;
}

export function renderGate(steps: StepResult[]): string {
  const sections = steps
    .filter((step) => !step.ok)
    .flatMap((step) => [
      `── ${step.name}${step.count === null ? " (unparsed output)" : ""} ──`,
      ...step.failures,
      "",
    ]);
  const verdict = steps.every((step) => step.ok) ? "passed" : "FAILED";

  return [
    ...sections,
    [`gate: ${verdict}`, ...steps.map(summarize)].join(" · "),
  ].join("\n");
}

function run(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
    },
  });

  return {
    ok: result.status === 0,
    output: [
      result.stdout ?? "",
      result.stderr ?? "",
      result.error ? String(result.error) : "",
      result.signal ? `pnpm ${args[0]} was killed by ${result.signal}` : "",
    ].join(""),
  };
}

/** Failures that start at column 0; their detail lines are indented. */
function countHeads(failures: string[]): number {
  return failures.filter((line) => line && !/^\s/.test(line)).length;
}

/** A step that failed with nothing parsed shows its whole output. */
function result(
  name: string,
  ok: boolean,
  output: string,
  failures: string[],
  count = countHeads(failures),
): StepResult {
  if (ok) return { name, ok, failures: [], count: 0 };
  if (failures.length === 0) {
    return { name, ok, failures: output.trimEnd().split("\n"), count: null };
  }

  return { name, ok, failures, count };
}

function main() {
  const root = process.cwd();
  const steps: StepResult[] = [];

  const typecheck = run(["typecheck"]);
  steps.push(
    result(
      "typecheck",
      typecheck.ok,
      typecheck.output,
      typecheckFailures(typecheck.output),
    ),
  );

  const lint = run(["lint", "--format", "unix"]);
  steps.push(result("lint", lint.ok, lint.output, lintFailures(lint.output)));

  const dir = mkdtempSync(path.join(tmpdir(), "gate-"));
  const reportFile = path.join(dir, "vitest.json");

  try {
    // The dot reporter is there for its "Unhandled Errors" block.
    const test = run([
      "test:unit",
      "--reporter=json",
      `--outputFile.json=${reportFile}`,
      "--reporter=dot",
    ]);
    let report: VitestReport | null = null;

    try {
      report = JSON.parse(readFileSync(reportFile, "utf8")) as VitestReport;
    } catch {
      // No report: vitest died before writing one, so its output is shown.
    }

    const failed = report ? testFailures(report, root) : [];
    const unhandled = unhandledErrors(test.output);
    const failures =
      unhandled.lines.length > 0 && failed.length > 0
        ? [...failed, "", ...unhandled.lines]
        : [...failed, ...unhandled.lines];

    steps.push({
      ...result(
        "test:unit",
        test.ok,
        test.output,
        failures,
        countHeads(failed) + unhandled.count,
      ),
      ...(report ? { passed: report.numPassedTests } : {}),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(renderGate(steps));
  process.exitCode = steps.every((step) => step.ok) ? 0 : 1;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main();
}

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

const TSC_ERROR = /^\S.*\(\d+,\d+\): error TS\d+:/;
const LINT_ERROR = /^\S+:\d+:\d+: .* \[Error\//;
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

/** A step that failed with nothing parsed shows its whole output. */
function result(
  name: string,
  ok: boolean,
  output: string,
  failures: string[],
): StepResult {
  if (ok) return { name, ok, failures: [], count: 0 };
  if (failures.length === 0) {
    return { name, ok, failures: output.trimEnd().split("\n"), count: null };
  }

  const count = failures.filter((line) => !/^\s/.test(line) && line).length;
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
    const test = run([
      "test:unit",
      "--reporter=json",
      `--outputFile=${reportFile}`,
    ]);
    let report: VitestReport | null = null;

    try {
      report = JSON.parse(readFileSync(reportFile, "utf8")) as VitestReport;
    } catch {
      // No report: vitest died before writing one, so its output is shown.
    }

    steps.push({
      ...result(
        "test:unit",
        test.ok,
        test.output,
        report ? testFailures(report, root) : [],
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

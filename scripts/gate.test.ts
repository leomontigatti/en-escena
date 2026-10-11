import { describe, expect, it } from "vitest";

import {
  lintFailures,
  renderGate,
  testFailures,
  typecheckFailures,
} from "./gate";

const ROOT = "/wt";

describe("typecheckFailures", () => {
  it("keeps each error with its continuation lines and drops pnpm's noise", () => {
    const output = [
      "$ react-router typegen && tsc --noEmit",
      "app/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      "app/b.tsx(7,3): error TS2345: Argument of type '{ id: string; }' is not assignable.",
      "  Property 'name' is missing in type '{ id: string; }'.",
      "[ELIFECYCLE] Command failed with exit code 1.",
    ].join("\n");

    expect(typecheckFailures(output)).toEqual([
      "app/a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      "app/b.tsx(7,3): error TS2345: Argument of type '{ id: string; }' is not assignable.",
      "  Property 'name' is missing in type '{ id: string; }'.",
    ]);
  });
});

describe("lintFailures", () => {
  it("keeps the errors of oxlint's unix format and leaves the warnings out", () => {
    const output = [
      "$ oxlint --format unix",
      "app/a.ts:3:23: Promises must be awaited, add void operator to ignore. [Error/typescript(no-floating-promises)]",
      "app/b.ts:1:1: Unused import. [Warning/eslint(no-unused-vars)]",
      "",
      "2 problems",
      "[ELIFECYCLE] Command failed with exit code 1.",
    ].join("\n");

    expect(lintFailures(output)).toEqual([
      "app/a.ts:3:23: Promises must be awaited, add void operator to ignore. [Error/typescript(no-floating-promises)]",
    ]);
  });
});

describe("testFailures", () => {
  it("names the failing test at its own file and line, with the message and no stack", () => {
    const report = {
      numPassedTests: 9,
      testResults: [
        {
          name: `${ROOT}/app/a.test.ts`,
          status: "failed",
          message: "",
          assertionResults: [
            { fullName: "passes", status: "passed", failureMessages: [] },
            {
              fullName: "money rounds half up",
              status: "failed",
              failureMessages: [
                [
                  "AssertionError: expected 2 to be 3 // Object.is equality",
                  "",
                  "- Expected",
                  "+ Received",
                  `    at ${ROOT}/app/lib/round.ts:4:9`,
                  `    at ${ROOT}/app/a.test.ts:12:46`,
                  `    at file://${ROOT}/node_modules/vitest/dist/run.js:1628:35`,
                ].join("\n"),
              ],
            },
          ],
        },
        {
          name: `${ROOT}/app/b.test.ts`,
          status: "passed",
          message: "",
          assertionResults: [],
        },
      ],
    };

    expect(testFailures(report, ROOT)).toEqual([
      "app/a.test.ts:12:46 › money rounds half up",
      "  AssertionError: expected 2 to be 3 // Object.is equality",
      "",
      "  - Expected",
      "  + Received",
    ]);
  });

  it("reports a file that failed before any test ran", () => {
    const report = {
      numPassedTests: 0,
      testResults: [
        {
          name: `${ROOT}/app/c.test.ts`,
          status: "failed",
          message: `Cannot find module './gone' imported from ${ROOT}/app/c.test.ts`,
          assertionResults: [],
        },
      ],
    };

    expect(testFailures(report, ROOT)).toEqual([
      "app/c.test.ts › failed to run",
      "  Cannot find module './gone' imported from app/c.test.ts",
    ]);
  });

  it("falls back to the file when no frame points into it", () => {
    const report = {
      numPassedTests: 0,
      testResults: [
        {
          name: `${ROOT}/app/d.test.ts`,
          status: "failed",
          message: "",
          assertionResults: [
            {
              fullName: "times out",
              status: "failed",
              failureMessages: ["Error: Test timed out in 5000ms."],
            },
          ],
        },
      ],
    };

    expect(testFailures(report, ROOT)).toEqual([
      "app/d.test.ts › times out",
      "  Error: Test timed out in 5000ms.",
    ]);
  });
});

describe("renderGate", () => {
  it("prints only the failing steps and one summary line", () => {
    const output = renderGate([
      { name: "typecheck", ok: true, failures: [], count: 0 },
      {
        name: "lint",
        ok: false,
        failures: ["app/a.ts:3:23: no. [Error/x]"],
        count: 1,
      },
      {
        name: "test:unit",
        ok: false,
        failures: ["app/a.test.ts:1:1 › t", "  boom"],
        count: 1,
        passed: 41,
      },
    ]);

    expect(output).toBe(
      [
        "── lint ──",
        "app/a.ts:3:23: no. [Error/x]",
        "",
        "── test:unit ──",
        "app/a.test.ts:1:1 › t",
        "  boom",
        "",
        "gate: FAILED · typecheck ok · lint 1 failure · test:unit 1 failure (41 passed)",
      ].join("\n"),
    );
  });

  it("is a single line when everything passes", () => {
    expect(
      renderGate([
        { name: "typecheck", ok: true, failures: [], count: 0 },
        { name: "lint", ok: true, failures: [], count: 0 },
        {
          name: "test:unit",
          ok: true,
          failures: [],
          count: 0,
          passed: 1840,
        },
      ]),
    ).toBe(
      "gate: passed · typecheck ok · lint ok · test:unit ok (1840 passed)",
    );
  });

  it("shows a failing step's whole output when nothing in it could be parsed", () => {
    expect(
      renderGate([
        {
          name: "typecheck",
          ok: false,
          failures: ["Error: react-router typegen crashed"],
          count: null,
        },
      ]),
    ).toBe(
      [
        "── typecheck (unparsed output) ──",
        "Error: react-router typegen crashed",
        "",
        "gate: FAILED · typecheck failed",
      ].join("\n"),
    );
  });
});

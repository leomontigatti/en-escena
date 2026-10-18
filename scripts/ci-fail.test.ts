import { describe, expect, it } from "vitest";

import { failedJobs, logTail } from "./ci-fail";

const RUN = "https://github.com/o/r/actions/runs/38132926028";

describe("failedJobs", () => {
  it("keeps the failed and cancelled checks with their Actions job id", () => {
    expect(
      failedJobs([
        {
          name: "checks",
          bucket: "pass",
          workflow: "CI",
          link: `${RUN}/job/1`,
        },
        {
          name: "db-shard 1/4",
          bucket: "fail",
          workflow: "CI",
          link: `${RUN}/job/114450808671`,
        },
        { name: "build", bucket: "pending", workflow: "CI", link: "" },
        {
          name: "e2e",
          bucket: "cancel",
          workflow: "CI",
          link: `${RUN}/job/7`,
        },
        { name: "lint", bucket: "skipping", workflow: "CI", link: "" },
      ]),
    ).toEqual([
      {
        name: "db-shard 1/4",
        workflow: "CI",
        link: `${RUN}/job/114450808671`,
        jobId: "114450808671",
      },
      { name: "e2e", workflow: "CI", link: `${RUN}/job/7`, jobId: "7" },
    ]);
  });

  it("has no job id for a check that is not an Actions job", () => {
    expect(
      failedJobs([
        {
          name: "Vercel",
          bucket: "fail",
          workflow: "",
          link: "https://vercel.com/x",
        },
      ]),
    ).toEqual([
      {
        name: "Vercel",
        workflow: "",
        link: "https://vercel.com/x",
        jobId: null,
      },
    ]);
  });
});

const line = (text: string, at = "10:45:22.7774359") =>
  `db-shard 1/4\tUNKNOWN STEP\t2026-10-11T${at}Z ${text}`;

describe("logTail", () => {
  it("ends at the last error marker, not at the cleanup after it, and strips prefixes and colours", () => {
    const log = [
      `db-shard 1/4\tUNKNOWN STEP\t﻿2026-10-11T10:42:48.4856425Z Current runner version: '2.337.0'`,
      line("##[group]Run pnpm test:db"),
      line(
        "\u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m app/a.db.test.ts > rounds",
      ),
      line("\u001b[31mAssertionError\u001b[39m: expected 2 to be 3"),
      line("##[endgroup]"),
      line("##[error]AssertionError: expected 2 to be 3"),
      line("##[error]Process completed with exit code 1."),
      line("Stop and remove container: 4965"),
      line("Cleaning up orphan processes"),
    ].join("\n");

    expect(logTail(log, 40)).toEqual([
      "Current runner version: '2.337.0'",
      " FAIL  app/a.db.test.ts > rounds",
      "AssertionError: expected 2 to be 3",
      "##[error]AssertionError: expected 2 to be 3",
      "##[error]Process completed with exit code 1.",
    ]);
  });

  it("strips the prefix of a continuation line, gh's printed colour codes and repeated blank lines", () => {
    const log = [
      line("^[[31mBetterAuthError^[[39m: Drizzle schema mismatch"),
      "db-shard 2/4\tUNKNOWN STEP\t  Missing columns",
      "db-shard 2/4\tUNKNOWN STEP\t",
      "db-shard 2/4\tUNKNOWN STEP\t",
      "db-shard 2/4\tUNKNOWN STEP\t    session.impersonatedBy",
      line("##[error]Process completed with exit code 1."),
    ].join("\n");

    expect(logTail(log, 40)).toEqual([
      "BetterAuthError: Drizzle schema mismatch",
      "  Missing columns",
      "",
      "    session.impersonatedBy",
      "##[error]Process completed with exit code 1.",
    ]);
  });

  it("keeps only the last lines before the cut", () => {
    const log = [
      line("one"),
      line("two"),
      line("three"),
      line("##[error]Process completed with exit code 1."),
    ].join("\n");

    expect(logTail(log, 2)).toEqual([
      "three",
      "##[error]Process completed with exit code 1.",
    ]);
  });

  it("tails the whole log when it has no error marker", () => {
    const log = [line("a"), line("b"), line("c")].join("\n");

    expect(logTail(log, 2)).toEqual(["b", "c"]);
  });
});

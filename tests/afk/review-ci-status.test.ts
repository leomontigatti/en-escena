import { describe, expect, it } from "vitest";

import {
  CI_CEILING_MS,
  describeCiFailure,
  latestCiRun,
  truncateLogTail,
  waitForCi,
  type CiRun,
} from "../../.sandcastle/agent-review/ci-status.mjs";
import { readCiResults } from "../../.sandcastle/agent-review/context.mjs";

// Coverage for #966: the review waits for the `CI` verdict on the head it is
// reviewing, because CI is the only place the full DB suite, `build`,
// `format:check` and the `check:*` scripts run. The wait is a convenience with a
// hard ceiling, never a gate — every way it can go wrong has to end in
// `not finished` and let the review start.

/** A `gh` stub: each call is answered by the first matching route. */
function stubGh(
  routes: Array<[RegExp, () => string]>,
): (args: string[]) => string {
  return (args) => {
    const line = args.join(" ");
    const route = routes.find(([pattern]) => pattern.test(line));
    if (route === undefined) throw new Error(`unstubbed gh call: ${line}`);
    return route[1]();
  };
}

/** A clock that advances by exactly what the code under test sleeps. */
function fakeClock() {
  let ms = 1_000_000;
  return {
    now: () => ms,
    sleep: (delta: number) => {
      ms += delta;
    },
    get elapsed() {
      return ms - 1_000_000;
    },
  };
}

function runList(...runs: CiRun[]): [RegExp, () => string] {
  return [/^run list/, () => JSON.stringify(runs)];
}

describe("waiting for the CI run on the reviewed head", () => {
  it("reports success once the run completes green", () => {
    const clock = fakeClock();

    const status = waitForCi("o/r", "abc123", {
      gh: stubGh([
        runList({ databaseId: 7, status: "completed", conclusion: "success" }),
      ]),
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(status.outcome).toBe("success");
    expect(clock.elapsed, "a finished run must not cost a poll interval").toBe(
      0,
    );
  });

  it("keeps polling while the run is in progress and reports the eventual failure", () => {
    const clock = fakeClock();
    let poll = 0;

    const status = waitForCi("o/r", "abc123", {
      gh: stubGh([
        [
          /^run list/,
          () => {
            poll += 1;
            return JSON.stringify([
              poll < 3
                ? { databaseId: 7, status: "in_progress", conclusion: null }
                : { databaseId: 7, status: "completed", conclusion: "failure" },
            ]);
          },
        ],
        [/--json jobs/, () => JSON.stringify(["db-tests", "build"])],
        [/--log-failed/, () => "boom: 1 test failed"],
      ]),
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(poll).toBe(3);
    expect(status.outcome).toBe("failure");
    expect(status.detail).toContain("Failed jobs: db-tests, build");
    expect(status.detail).toContain("boom: 1 test failed");
  });

  it("gives up at the ceiling instead of waiting for a run that never finishes", () => {
    const clock = fakeClock();

    const status = waitForCi("o/r", "abc123", {
      gh: stubGh([
        runList({ databaseId: 7, status: "in_progress", conclusion: null }),
      ]),
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(status.outcome).toBe("not finished");
    expect(status.detail).toContain("still running after 10 minutes");
    expect(clock.elapsed).toBeLessThanOrEqual(CI_CEILING_MS);
  });

  it("says so when no CI run exists for the head at all", () => {
    const clock = fakeClock();

    const status = waitForCi("o/r", "abc123", {
      gh: stubGh([runList()]),
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(status.outcome).toBe("not finished");
    expect(status.detail).toContain("No `CI` run was found");
  });
});

describe("a CI wait that goes wrong never gates the review", () => {
  it("degrades a broken `gh` to `not finished` rather than sinking the review", () => {
    const clock = fakeClock();

    const status = waitForCi("o/r", "abc123", {
      gh: () => {
        throw new Error("gh: HTTP 500");
      },
      sleep: clock.sleep,
      now: clock.now,
      ceilingMs: 60_000,
      pollIntervalMs: 20_000,
    });

    expect(status.outcome).toBe("not finished");
  });

  it("asks GitHub for the `CI` workflow on that one sha, never for all checks", () => {
    // Waiting on every check on the PR would include the review's own run.
    const calls: string[][] = [];
    latestCiRun("o/r", "abc123", (args) => {
      calls.push(args);
      return "[]";
    });

    expect(calls[0]).toContain("--workflow");
    expect(calls[0][calls[0].indexOf("--workflow") + 1]).toBe("CI");
    expect(calls[0][calls[0].indexOf("--commit") + 1]).toBe("abc123");
  });
});

describe("the failure detail handed to the reviewer", () => {
  it("still names the failure when neither jobs nor logs can be read", () => {
    const detail = describeCiFailure("o/r", 7, () => {
      throw new Error("nope");
    });

    expect(detail).toContain("(job names unavailable)");
    expect(detail).toContain("(no failing-step log available)");
  });

  it("keeps the tail of a long log, where the actual error is", () => {
    const log = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");

    const tail = truncateLogTail(log);

    expect(tail).toContain("line 499");
    expect(tail).not.toContain("line 0\n");
    expect(tail).toContain("earlier lines omitted");
  });

  it("caps a log whose lines are individually huge", () => {
    const log = Array.from({ length: 20 }, () => "x".repeat(2000)).join("\n");

    expect(truncateLogTail(log).length).toBeLessThan(9000);
  });

  it("keeps a single over-long line whole rather than emptying the block", () => {
    const log = "x".repeat(20000);

    const tail = truncateLogTail(log);

    expect(tail.length).toBeGreaterThan(0);
    expect(tail.length).toBeLessThan(9000);
    expect(tail).toContain("x");
  });
});

describe("the CI block the prompt embeds", () => {
  it("reads `not finished` when the wait step left no file behind", () => {
    expect(readCiResults(undefined)).toContain("Outcome: not finished");
    expect(readCiResults("/nonexistent-afk-output")).toContain(
      "Outcome: not finished",
    );
  });
});

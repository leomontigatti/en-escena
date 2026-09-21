import { describe, expect, it } from "vitest";

import {
  REQUIRED_CONTEXTS,
  issueEvent,
  parseArgs,
  prEvent,
  summarizeChecks,
} from "./afk-watch.mjs";

type PrSnapshot = Parameters<typeof prEvent>[2];

function openPr(overrides: Partial<PrSnapshot> = {}): PrSnapshot {
  return {
    number: 1,
    state: "OPEN",
    mergedAt: null,
    head: "aaa",
    labels: [],
    reviews: 1,
    comments: 0,
    unresolvedThreads: 0,
    mergeState: "CLEAN",
    checks: {},
    checksTerminal: false,
    checksGreen: false,
    ...overrides,
  };
}

describe("parseArgs", () => {
  it("reads the target and the options", () => {
    expect(
      parseArgs(["pr", "12", "--until", "review", "--interval", "5"]),
    ).toMatchObject({
      kind: "pr",
      number: 12,
      until: "review",
      interval: 5,
      timeout: 10_800,
      contexts: REQUIRED_CONTEXTS,
    });
  });

  it("rejects an event the target does not have", () => {
    expect(() => parseArgs(["issue", "3", "--until", "review"])).toThrow(
      /unknown issue event/,
    );
    expect(() => parseArgs(["pr", "3", "--until", "closed"])).toThrow(
      /unknown pr event/,
    );
  });

  it("accepts any label event on an issue", () => {
    expect(
      parseArgs(["issue", "3", "--until", "label:agent:implement"]).until,
    ).toBe("label:agent:implement");
  });
});

describe("prEvent", () => {
  it("fires review only once the run labels are gone and a review was added", () => {
    const baseline = openPr({ labels: ["agent:review"], reviews: 1 });
    expect(
      prEvent(
        "review",
        baseline,
        openPr({ labels: ["agent:in-progress"], reviews: 2 }),
      ),
    ).toBeNull();
    expect(prEvent("review", baseline, openPr({ reviews: 1 }))).toBeNull();
    expect(prEvent("review", baseline, openPr({ reviews: 2 }))).toBe("review");
  });

  it("fires implement when the head or the comments moved after the run", () => {
    const baseline = openPr({ labels: ["agent:implement"] });
    expect(
      prEvent(
        "implement",
        baseline,
        openPr({ labels: ["agent:in-progress"], head: "bbb" }),
      ),
    ).toBeNull();
    expect(prEvent("implement", baseline, openPr({ head: "bbb" }))).toBe(
      "implement",
    );
    expect(prEvent("implement", baseline, openPr({ comments: 1 }))).toBe(
      "implement",
    );
  });

  it("reports a failed run, a merge and a close whatever was awaited", () => {
    const baseline = openPr();
    expect(
      prEvent("implement", baseline, openPr({ labels: ["agent:blocked"] })),
    ).toBe("blocked");
    expect(
      prEvent(
        "checks",
        baseline,
        openPr({ state: "MERGED", mergedAt: "2026-09-17T00:00:00Z" }),
      ),
    ).toBe("merged");
    expect(prEvent("review", baseline, openPr({ state: "CLOSED" }))).toBe(
      "closed",
    );
  });

  it("reports checks only once every required context is terminal", () => {
    const baseline = openPr();
    expect(
      prEvent("checks", baseline, openPr({ checksTerminal: false })),
    ).toBeNull();
    expect(
      prEvent(
        "checks",
        baseline,
        openPr({ checksTerminal: true, checksGreen: true }),
      ),
    ).toBe("checks-green");
    expect(
      prEvent(
        "checks",
        baseline,
        openPr({ checksTerminal: true, checksGreen: false }),
      ),
    ).toBe("checks-red");
  });
});

describe("issueEvent", () => {
  it("matches closed, an open agent PR and a label", () => {
    const issue = {
      state: "OPEN",
      labels: ["agent:queued"],
      openPrs: [] as number[],
    };
    expect(issueEvent("closed", issue)).toBeNull();
    expect(issueEvent("closed", { ...issue, state: "CLOSED" })).toBe("closed");
    expect(issueEvent("pr", { ...issue, openPrs: [9] })).toBe("pr");
    expect(issueEvent("label:agent:queued", issue)).toBe("label:agent:queued");
    expect(issueEvent("label:agent:implement", issue)).toBeNull();
  });
});

describe("summarizeChecks", () => {
  it("treats a missing or running context as pending and all successes as green", () => {
    const rollup = [
      { name: "checks", conclusion: "SUCCESS" },
      { name: "db-gate", status: "IN_PROGRESS" },
    ];
    const pending = summarizeChecks(rollup, ["checks", "db-gate", "docs-gate"]);
    expect(pending.byName).toEqual({
      checks: "success",
      "db-gate": "in_progress",
      "docs-gate": "missing",
    });
    expect(pending.terminal).toBe(false);

    const green = summarizeChecks(
      [
        { name: "checks", conclusion: "SUCCESS" },
        { context: "db-gate", state: "SUCCESS" },
      ],
      ["checks", "db-gate"],
    );
    expect(green).toMatchObject({ terminal: true, green: true });

    const red = summarizeChecks(
      [{ name: "checks", conclusion: "FAILURE" }],
      ["checks"],
    );
    expect(red).toMatchObject({ terminal: true, green: false });
  });

  it("holds while `pr-title` is pending and goes red when it fails", () => {
    const fromCi = ["checks", "db-gate", "docs-gate", "actions-gate"].map(
      (name) => ({ name, conclusion: "SUCCESS" }),
    );
    const baseline = openPr();

    const pending = summarizeChecks(
      [...fromCi, { name: "pr-title", status: "IN_PROGRESS" }],
      REQUIRED_CONTEXTS,
    );
    expect(pending).toMatchObject({ terminal: false, green: false });
    expect(
      prEvent(
        "checks",
        baseline,
        openPr({
          checks: pending.byName,
          checksTerminal: pending.terminal,
          checksGreen: pending.green,
        }),
      ),
    ).toBeNull();

    const failed = summarizeChecks(
      [...fromCi, { name: "pr-title", conclusion: "FAILURE" }],
      REQUIRED_CONTEXTS,
    );
    expect(failed).toMatchObject({ terminal: true, green: false });
    expect(
      prEvent(
        "checks",
        baseline,
        openPr({
          checks: failed.byName,
          checksTerminal: failed.terminal,
          checksGreen: failed.green,
        }),
      ),
    ).toBe("checks-red");
  });
});

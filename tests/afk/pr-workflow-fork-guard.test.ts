import { describe, expect, it } from "vitest";

import {
  evalGha,
  forkExposedWorkflows,
  jobConditions,
  PR_WORKFLOWS,
} from "./pr-workflows.test-support";

// Coverage for #635: the three workflows-over-a-PR run on `pull_request_target`,
// which evaluates the workflow from the base branch but runs with this repo's
// secrets — and each then checks out `pull_request.head.sha`. On a PR from a
// fork that puts contributor-controlled code on disk with `AGENT_PAT` reachable
// (persisted into `.git/config`, then fed to `pnpm install` lifecycle scripts
// and to the runner script itself). The `agent:*` label was the only gate, and a
// label says nothing about provenance.
//
// The guard is a job-level `if:`, which is the only form that keeps the
// untrusted tree from ever being checked out — a step-level refusal would run
// after the checkout it is trying to prevent.

const THIS_REPO = "leomontigatti/en-escena";

/** Evaluate every job `if:` in a workflow for one `labeled` event. */
function jobsRunFor(
  file: string,
  event: { labelName: string; headRepo: string },
): string[] {
  return jobConditions(file)
    .filter(({ condition }) =>
      condition === ""
        ? true
        : evalGha(condition, {
            "github.event.label.name": event.labelName,
            "github.event.pull_request.head.repo.full_name": event.headRepo,
            "github.repository": THIS_REPO,
          }) === "true",
    )
    .map(({ job }) => job);
}

describe("PR-mutating workflows fork guard (#635)", () => {
  it("runs on a same-repo PR carrying its own label", () => {
    for (const { file, label } of PR_WORKFLOWS) {
      const running = jobsRunFor(file, {
        labelName: label,
        headRepo: THIS_REPO,
      });
      expect(running, `${file} must still run on a same-repo PR`).not.toEqual(
        [],
      );
    }
  });

  it("runs nothing on a fork PR, even when the label matches", () => {
    for (const { file, label } of PR_WORKFLOWS) {
      const running = jobsRunFor(file, {
        labelName: label,
        headRepo: "attacker/en-escena",
      });
      expect(
        running,
        `${file} would execute fork code with AGENT_PAT in scope`,
      ).toEqual([]);
    }
  });

  it("runs nothing when the label does not match, fork or not", () => {
    for (const { file } of PR_WORKFLOWS) {
      for (const headRepo of [THIS_REPO, "attacker/en-escena"]) {
        expect(
          jobsRunFor(file, { labelName: "enhancement", headRepo }),
        ).toEqual([]);
      }
    }
  });

  it("guards every workflow that checks out PR head under pull_request_target", () => {
    // Discovered from `.github/workflows/`, not listed: the guard is a property
    // of a *shape* (privileged trigger + head-of-PR checkout), so a fourth
    // workflow of that shape has to fail here rather than go uncovered because
    // nobody remembered to extend `PR_WORKFLOWS`.
    expect(forkExposedWorkflows()).toEqual(
      PR_WORKFLOWS.map(({ file }) => file).sort(),
    );
  });

  it("gives every job an explicit condition, so a new job cannot omit the guard", () => {
    for (const file of forkExposedWorkflows()) {
      for (const { job, condition } of jobConditions(file)) {
        expect(condition, `${file}: job \`${job}\` has no \`if:\``).not.toBe(
          "",
        );
        expect(
          condition,
          `${file}: job \`${job}\` does not check the PR's origin`,
        ).toContain(
          "github.event.pull_request.head.repo.full_name == github.repository",
        );
      }
    }
  });
});

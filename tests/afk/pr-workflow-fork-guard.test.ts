import { describe, expect, it } from "vitest";

import { forkExposedWorkflows } from "./pr-workflows.test-support";

// Coverage for #635. A workflow on `pull_request_target` runs with this repo's
// secrets, and one that also checks out `pull_request.head` puts a fork's code
// on disk inside that job. The label-triggered runners that had this shape were
// retired (ADR-0016), and nothing on disk has it now. This keeps it that way:
// a new one needs a job-level `if:` requiring
// `github.event.pull_request.head.repo.full_name == github.repository` on every
// job (a step-level refusal runs after the checkout it is trying to prevent),
// and a test that evaluates it; the retired suite is in git history.

describe("PR-mutating workflows fork guard (#635)", () => {
  it("has no workflow that checks out a PR head under pull_request_target", () => {
    expect(forkExposedWorkflows()).toEqual([]);
  });
});

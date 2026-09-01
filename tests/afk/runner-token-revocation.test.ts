import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

// The agent must never hold a GitHub credential (spec §3.9: "the agent never
// mutates the tracker/VCS remote"). Runners that prefetch context — review,
// implement-pr, update-branch — need a token for their own read-only `gh` calls,
// so their workflow step exports `GH_TOKEN`. That alone used to be enough to
// reach the agent: sandcastle's `noSandbox()` builds the agent environment as
// `{ ...process.env }`, so the agent inherited a working, write-capable token
// and its `gh` calls would have *succeeded* silently. The prompt saying "do not
// run gh" was the only thing standing in the way.
import { revokeGitHubToken } from "../../.sandcastle/lib/runner.mjs";

const PREFETCHING_RUNNERS = [
  ".sandcastle/agent-review/review.mts",
  ".sandcastle/agent-implement-pr/implement-pr.mts",
  ".sandcastle/agent-update-branch/update-branch.mts",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("revokeGitHubToken", () => {
  it("drops every GitHub credential from the environment the agent inherits", () => {
    vi.stubEnv("GH_TOKEN", "ghs_orchestrator");
    vi.stubEnv("GITHUB_TOKEN", "ghs_orchestrator");
    vi.stubEnv("GH_ENTERPRISE_TOKEN", "ghs_orchestrator");

    revokeGitHubToken();

    expect(process.env.GH_TOKEN).toBeUndefined();
    expect(process.env.GITHUB_TOKEN).toBeUndefined();
    expect(process.env.GH_ENTERPRISE_TOKEN).toBeUndefined();
  });

  it("is a no-op when no token was set, so the token-less runners are unaffected", () => {
    expect(() => revokeGitHubToken()).not.toThrow();
  });
});

describe("the prefetching runners", () => {
  it.each(PREFETCHING_RUNNERS)(
    "%s revokes the token before invoking the agent",
    (path) => {
      const source = readFileSync(path, "utf8");

      const revokedAt = source.indexOf("revokeGitHubToken()");
      const agentAt = source.indexOf("createAgent()");

      expect(revokedAt).toBeGreaterThan(-1);
      expect(agentAt).toBeGreaterThan(-1);
      expect(revokedAt).toBeLessThan(agentAt);
    },
  );
});

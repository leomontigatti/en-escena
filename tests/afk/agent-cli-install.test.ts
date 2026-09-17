import { describe, expect, it } from "vitest";

import { workflowFiles, workflowText } from "./pr-workflows.test-support";

// Coverage for #966: what the runners start from has to be the same thing on
// every run. Two properties, both read off `.github/workflows/` rather than a
// checklist, so a workflow added later is audited the moment it lands:
//
//   - Claude Code comes from the `stable` tag through pnpm, with
//     `--allow-build` (pnpm otherwise reports success, skips the CLI's
//     postinstall, and `claude` dies at run time with "native binary not
//     installed") and a `claude --version` in the same step, which is what
//     turns that into an install-time failure and logs the resolved version;
//   - the `code-review` skill comes from `origin/master`, never from the
//     checked-out PR head — `pull_request_target` puts the PR author's tree on
//     disk, and reading the skill from there would let a PR edit the reviewer
//     that reviews it.

const INSTALL =
  "pnpm add -g --allow-build=@anthropic-ai/claude-code @anthropic-ai/claude-code@stable";

/** Every workflow that installs the Claude Code CLI, however it spells it. */
function installingWorkflows(): string[] {
  return workflowFiles().filter((file) =>
    /@anthropic-ai\/claude-code/.test(workflowText(file)),
  );
}

describe("the Claude Code CLI the runners install (#966)", () => {
  it("is installed in the seven workflows that run an agent", () => {
    expect(installingWorkflows().length).toBe(7);
  });

  it("comes from the stable tag through pnpm, never from a global npm install", () => {
    for (const file of installingWorkflows()) {
      const text = workflowText(file);
      expect(
        text,
        `${file}: a global npm install pins nothing and skips pnpm's build allowlist`,
      ).not.toMatch(/npm install -g @anthropic-ai\/claude-code/);
      expect(
        text,
        `${file}: install Claude Code with \`${INSTALL}\``,
      ).toContain(INSTALL);
    }
  });

  it("is verified with `claude --version` in the same step as the install", () => {
    for (const file of installingWorkflows()) {
      const lines = workflowText(file).split("\n");
      const at = lines.findIndex((line) => line.includes(INSTALL));
      const next = lines
        .slice(at + 1)
        .find((line) => line.trim() !== "" && !/^\s*#/.test(line));
      expect(
        next?.trim(),
        `${file}: \`claude --version\` must follow the install immediately — without it a skipped postinstall only surfaces when the agent runs`,
      ).toBe("claude --version");
    }
  });
});

describe("where the review loads the `code-review` skill from (#966)", () => {
  const reviewWorkflow = ".github/workflows/agent-review.yml";

  it("never fetches it from the network at run time", () => {
    for (const file of workflowFiles()) {
      expect(
        workflowText(file),
        `${file}: \`npx skills@latest\` makes each run depend on whatever is published that day`,
      ).not.toMatch(/npx\s+(--yes\s+)?skills@latest/);
    }
  });

  it("copies the vendored skill out of origin/master, not out of the work tree", () => {
    const text = workflowText(reviewWorkflow);

    expect(text).toMatch(
      /git archive origin\/master \.agents\/skills\/code-review/,
    );
    // The destination is outside the work tree, so a commit step cannot sweep
    // the skill into the PR branch.
    expect(text).toMatch(/skill="\$HOME\/\.claude\/skills\/code-review"/);
  });

  it("guarantees the origin/master ref the copy reads exists", () => {
    expect(workflowText(reviewWorkflow)).toContain(
      "git fetch --no-tags origin +refs/heads/master:refs/remotes/origin/master",
    );
  });
});

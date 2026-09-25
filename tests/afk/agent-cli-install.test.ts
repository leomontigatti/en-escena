import { describe, expect, it } from "vitest";

import { workflowFiles, workflowText } from "./pr-workflows.test-support";

// Coverage for #966: what the runners start from has to be the same thing on
// every run. Two properties, both read off `.github/workflows/` rather than a
// checklist, so a workflow added later is audited the moment it lands:
//
//   - Claude Code comes from the `stable` tag through pnpm, with
//     `--allow-build` (pnpm otherwise reports success, skips the CLI's
//     postinstall, and `claude` dies at run time with "native binary not
//     installed"), a global bin directory that is actually on PATH, and a
//     `claude --version` in the same step, which is what turns both of those
//     into an install-time failure and logs the resolved version;
//   - the `code-review` skill comes from `origin/master`, never from the
//     checked-out PR head — `pull_request_target` puts the PR author's tree on
//     disk, and reading the skill from there would let a PR edit the reviewer
//     that reviews it.

const INSTALL =
  'pnpm add -g --global-bin-dir "$PNPM_HOME" --allow-build=@anthropic-ai/claude-code @anthropic-ai/claude-code@stable';

/** Every workflow that installs the Claude Code CLI, however it spells it. */
function installingWorkflows(): string[] {
  return workflowFiles().filter((file) =>
    /@anthropic-ai\/claude-code/.test(workflowText(file)),
  );
}

describe("the Claude Code CLI the runners install (#966)", () => {
  it("is installed in the two workflows that run an agent", () => {
    expect(installingWorkflows().length).toBe(2);
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

  // `pnpm/action-setup` exports `PNPM_HOME` and puts *that* directory on PATH,
  // but pnpm's default global bin dir is `$PNPM_HOME/bin`, which is not on it.
  // pnpm refuses a global add whose bin dir is off PATH, so a bare `pnpm add -g`
  // exits 1 on the runner before it installs anything; and even if it succeeded,
  // the later runner step spawns a bare `claude` and would not find it.
  it("installs into a global bin directory that is already on the runner's PATH", () => {
    for (const file of installingWorkflows()) {
      const text = workflowText(file);
      expect(
        text,
        `${file}: pnpm refuses \`add -g\` when its global bin dir is off PATH`,
      ).toContain('--global-bin-dir "$PNPM_HOME"');
      expect(
        text,
        `${file}: fail loudly if pnpm/action-setup has not run, rather than passing an empty --global-bin-dir`,
      ).toContain('if [ -z "${PNPM_HOME-}" ]; then');
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

describe("what a run never fetches at run time (#966)", () => {
  it("never pulls a skill from the network", () => {
    for (const file of workflowFiles()) {
      expect(
        workflowText(file),
        `${file}: \`npx skills@latest\` makes each run depend on whatever is published that day`,
      ).not.toMatch(/npx\s+(--yes\s+)?skills@latest/);
    }
  });
});

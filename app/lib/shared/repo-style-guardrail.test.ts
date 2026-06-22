import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkRepoStyle,
  runRepoStyleGuardrail,
} from "../../../scripts/repo-style-guardrail";

describe("repo style guardrail", () => {
  test("flags hardcoded Tailwind colors and space utilities while allowing explicit exceptions", async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "repo-style-guardrail-"),
    );

    try {
      await writeFile(
        path.join(tempRoot, "feature.tsx"),
        [
          'export const Feature = () => <div className="bg-slate-50 space-y-4 text-foreground" />;',
          'export const AvatarGroup = () => <div className="flex -space-x-2" data-layout="overlap" />;',
        ].join("\n"),
      );

      const violations = await checkRepoStyle({
        rootDirectory: tempRoot,
        files: [path.join(tempRoot, "feature.tsx")],
      });

      expect(violations).toEqual([
        expect.objectContaining({
          filePath: "feature.tsx",
          rule: "no-tailwind-hardcoded-colors",
          utility: "bg-slate-50",
        }),
        expect.objectContaining({
          filePath: "feature.tsx",
          rule: "prefer-gap-over-space",
          utility: "space-y-4",
        }),
        expect.objectContaining({
          filePath: "feature.tsx",
          rule: "prefer-gap-over-space",
          utility: "-space-x-2",
        }),
      ]);
      expect(violations).toHaveLength(3);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("keeps the current app code clean under the guardrail", async () => {
    const violations = await checkRepoStyle();

    expect(violations).toEqual([]);
  });

  test("ships a dedicated command and workflow documentation for the guardrail", async () => {
    const [packageJson, workflowDoc] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("docs/agents/codex-workflows.md", "utf8"),
    ]);

    expect(packageJson).toContain(
      '"guardrail:repo-style": "node --import tsx scripts/repo-style-guardrail.ts"',
    );
    expect(workflowDoc).toContain("`npm run guardrail:repo-style`");
    expect(workflowDoc).toContain("repo-style");
    await expect(runRepoStyleGuardrail()).resolves.toBeUndefined();
  });
});

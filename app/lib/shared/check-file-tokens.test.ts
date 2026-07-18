import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import {
  checkFileTokens,
  runFileTokenCheck,
} from "../../../scripts/check-file-tokens";

describe("file-token check", () => {
  test("measures the staged blob instead of unstaged working-tree edits", async () => {
    const violations = await checkFileTokens({
      cwd: "/virtual/repo",
      git: createGitFileTokenSource({
        "app/routes/review.tsx": createFileContents(5_600),
      }),
    });

    expect(violations).toEqual([
      {
        estimatedTokens: 5_600,
        filePath: "app/routes/review.tsx",
      },
    ]);
  });

  test("reports staged application files above the token limit while excluding non-application files", async () => {
    const violations = await checkFileTokens({
      cwd: "/virtual/repo",
      git: createGitFileTokenSource({
        "app/routes/review.tsx": createFileContents(5_600),
        "app/components/overview.tsx": createFileContents(7_250),
        "app/lib/server/detail.ts": createFileContents(10_250),
        "docs/notes.md": createFileContents(9_000),
        "public/banner.svg": createFileContents(11_000),
        "build/server/index.js": createFileContents(12_000),
        "pnpm-lock.yaml": createFileContents(8_000),
        "app/components/overview.test.tsx": createFileContents(9_500),
        "app/lib/server/__generated__/types.ts": createFileContents(9_750),
      }),
    });

    expect(violations).toEqual([
      {
        estimatedTokens: 10_250,
        filePath: "app/lib/server/detail.ts",
      },
      {
        estimatedTokens: 7_250,
        filePath: "app/components/overview.tsx",
      },
      {
        estimatedTokens: 5_600,
        filePath: "app/routes/review.tsx",
      },
    ]);
  });

  test("ships the strict command contract in package scripts, hook wiring, and agent docs", async () => {
    const [
      packageJson,
      preCommitHook,
      workflowDoc,
      codingStandards,
      codebaseMap,
    ] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile(".husky/pre-commit", "utf8"),
      readFile("docs/agents/workflows.md", "utf8"),
      readFile(".sandcastle/CODING_STANDARDS.md", "utf8"),
      readFile("docs/agents/codebase-map.md", "utf8"),
    ]);

    expect(packageJson).toContain(
      '"check:file-tokens": "node --import tsx scripts/check-file-tokens.ts"',
    );
    expect(preCommitHook).toContain("pnpm exec lint-staged");
    expect(preCommitHook).toContain("pnpm typecheck");
    expect(preCommitHook).toContain("pnpm check:file-tokens");
    expect(workflowDoc).toContain("`pnpm check:file-tokens`");
    expect(workflowDoc).toContain("strict file-token check");
    expect(codingStandards).toContain("5500");
    expect(codingStandards).toContain("clear module boundary");
    expect(codebaseMap).toContain("`pnpm check:file-tokens`");

    await expect(
      runFileTokenCheck({ cwd: process.cwd(), files: [] }),
    ).resolves.toBeUndefined();
  });
});

function createFileContents(estimatedTokens: number) {
  return "x".repeat(estimatedTokens * 4);
}

function createGitFileTokenSource(files: Record<string, string>) {
  return {
    getStagedFiles() {
      return Object.keys(files);
    },

    readStagedFile(_cwd: string, filePath: string) {
      const contents = files[filePath];

      if (contents === undefined) {
        throw new Error(`Unexpected staged file read: ${filePath}`);
      }

      return Buffer.from(contents);
    },
  };
}

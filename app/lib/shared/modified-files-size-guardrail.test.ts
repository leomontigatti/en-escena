import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkModifiedFileSizes,
  runModifiedFileSizeGuardrail,
} from "../../../scripts/modified-files-size-guardrail";

describe("modified files size guardrail", () => {
  test("reports changed application files above maintainability tiers while excluding non-application files", async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "modified-files-size-guardrail-"),
    );

    try {
      await writeGuardrailFile(
        tempRoot,
        "app/routes/review.tsx",
        createFileContents(100),
      );
      await writeGuardrailFile(
        tempRoot,
        "app/components/overview.tsx",
        createFileContents(100),
      );
      await writeGuardrailFile(tempRoot, "docs/notes.md", "seed");
      await writeGuardrailFile(tempRoot, "public/banner.svg", "seed");
      await writeGuardrailFile(tempRoot, "build/server/index.js", "seed");
      await writeGuardrailFile(tempRoot, "package-lock.json", "{}");
      await writeGuardrailFile(
        tempRoot,
        "app/components/overview.test.tsx",
        createFileContents(100),
      );

      initGitRepository(tempRoot);

      await writeGuardrailFile(
        tempRoot,
        "app/routes/review.tsx",
        createFileContents(5_600),
      );
      await writeGuardrailFile(
        tempRoot,
        "app/components/overview.tsx",
        createFileContents(7_250),
      );
      await writeGuardrailFile(
        tempRoot,
        "app/lib/server/detail.ts",
        createFileContents(10_250),
      );
      await writeGuardrailFile(
        tempRoot,
        "docs/notes.md",
        createFileContents(9_000),
      );
      await writeGuardrailFile(
        tempRoot,
        "public/banner.svg",
        createFileContents(11_000),
      );
      await writeGuardrailFile(
        tempRoot,
        "build/server/index.js",
        createFileContents(12_000),
      );
      await writeGuardrailFile(
        tempRoot,
        "package-lock.json",
        createFileContents(8_000),
      );
      await writeGuardrailFile(
        tempRoot,
        "app/components/overview.test.tsx",
        createFileContents(9_500),
      );

      const violations = await checkModifiedFileSizes({ cwd: tempRoot });

      expect(violations).toEqual([
        {
          estimatedTokens: 10_250,
          filePath: "app/lib/server/detail.ts",
          tier: 10_000,
        },
        {
          estimatedTokens: 7_250,
          filePath: "app/components/overview.tsx",
          tier: 7_000,
        },
        {
          estimatedTokens: 5_600,
          filePath: "app/routes/review.tsx",
          tier: 5_500,
        },
      ]);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("ships a dedicated command and documentation for the maintainability signal", async () => {
    const [packageJson, workflowDoc, codingStandards] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("docs/agents/codex-workflows.md", "utf8"),
      readFile("docs/agents/coding-standards.md", "utf8"),
    ]);

    expect(packageJson).toContain(
      '"guardrail:modified-file-size": "node --import tsx scripts/modified-files-size-guardrail.ts"',
    );
    expect(workflowDoc).toContain("`npm run guardrail:modified-file-size`");
    expect(workflowDoc).toContain("maintainability signal");
    expect(codingStandards).toContain("7000");
    expect(codingStandards).toContain("10000");

    await expect(
      runModifiedFileSizeGuardrail({ cwd: process.cwd(), files: [] }),
    ).resolves.toBeUndefined();
  });
});

function createFileContents(estimatedTokens: number) {
  return "x".repeat(estimatedTokens * 4);
}

async function writeGuardrailFile(
  rootDirectory: string,
  relativePath: string,
  contents: string,
) {
  const absolutePath = path.join(rootDirectory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

function initGitRepository(rootDirectory: string) {
  execFileSync("git", ["init"], { cwd: rootDirectory, stdio: "pipe" });
  execFileSync("git", ["add", "."], { cwd: rootDirectory, stdio: "pipe" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test User",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "seed",
    ],
    {
      cwd: rootDirectory,
      stdio: "pipe",
    },
  );
}

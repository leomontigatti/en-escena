import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const maxEstimatedTokens = 5_500;

const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.test\.(ts|tsx)$/;

const excludedPathSegments = [
  "docs/",
  "public/",
  "build/",
  ".react-router/",
  "coverage/",
];

const excludedFileNames = new Set(["pnpm-lock.yaml", "yarn.lock"]);

export type FileTokenViolation = {
  estimatedTokens: number;
  filePath: string;
};

type CheckFileTokensOptions = {
  cwd?: string;
  files?: string[];
};

type FileContentSource = "staged" | "working-tree";

export async function checkFileTokens(
  options: CheckFileTokensOptions = {},
): Promise<FileTokenViolation[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const files = options.files ?? getStagedFiles(cwd);
  const fileContentSource: FileContentSource =
    options.files === undefined ? "staged" : "working-tree";

  return files
    .map((filePath) => path.normalize(filePath))
    .filter(isApplicationSourceFile)
    .map((filePath) => {
      const estimatedTokens = Math.ceil(
        readFileByteLength(cwd, filePath, fileContentSource) / 4,
      );

      if (estimatedTokens <= maxEstimatedTokens) {
        return null;
      }

      return {
        estimatedTokens,
        filePath,
      };
    })
    .filter((violation): violation is FileTokenViolation => violation !== null)
    .sort(
      (left, right) =>
        right.estimatedTokens - left.estimatedTokens ||
        left.filePath.localeCompare(right.filePath),
    );
}

export async function runFileTokenCheck(
  options: CheckFileTokensOptions = {},
): Promise<void> {
  const violations = await checkFileTokens(options);

  if (violations.length === 0) {
    return;
  }

  const lines = [
    `File-token check found staged files above ${maxEstimatedTokens} estimated tokens:`,
    ...violations.map(
      (violation) =>
        `- ${violation.filePath}: ${violation.estimatedTokens} estimated tokens`,
    ),
    "",
    "Split these files at a clear module boundary before committing.",
  ];

  throw new Error(lines.join("\n"));
}

function getStagedFiles(cwd: string) {
  return readNullSeparatedGitOutput(
    cwd,
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--diff-filter=ACMR",
    "--",
  );
}

function readNullSeparatedGitOutput(cwd: string, ...args: string[]) {
  const output = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return output.split("\0").filter(Boolean);
}

function readFileByteLength(
  cwd: string,
  filePath: string,
  fileContentSource: FileContentSource,
) {
  switch (fileContentSource) {
    case "staged":
      return readGitBlob(cwd, `:${filePath}`).byteLength;
    case "working-tree":
      return readFileSync(path.resolve(cwd, filePath)).byteLength;
  }
}

function isApplicationSourceFile(filePath: string) {
  const normalizedPath = filePath.split(path.sep).join("/");
  const baseName = path.posix.basename(normalizedPath);

  if (!normalizedPath.startsWith("app/")) {
    return false;
  }

  if (
    excludedPathSegments.some((segment) => normalizedPath.includes(segment)) ||
    excludedFileNames.has(baseName)
  ) {
    return false;
  }

  if (
    !sourceFilePattern.test(baseName) ||
    testFilePattern.test(baseName) ||
    baseName.endsWith(".d.ts")
  ) {
    return false;
  }

  return !isGeneratedPath(normalizedPath);
}

function isGeneratedPath(filePath: string) {
  return (
    filePath.includes("/__generated__/") ||
    filePath.endsWith(".generated.ts") ||
    filePath.endsWith(".generated.tsx") ||
    filePath.endsWith(".gen.ts") ||
    filePath.endsWith(".gen.tsx")
  );
}

function readGitBlob(cwd: string, objectName: string) {
  return execFileSync("git", ["show", objectName], {
    cwd,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runFileTokenCheck().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

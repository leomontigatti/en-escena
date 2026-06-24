import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const sizeTiers = [10_000, 7_000, 5_500] as const;

type SizeTier = (typeof sizeTiers)[number];

const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.test\.(ts|tsx)$/;

const excludedPathSegments = [
  "docs/",
  "public/",
  "build/",
  ".react-router/",
  "coverage/",
];

const excludedFileNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

export type ModifiedFileSizeViolation = {
  estimatedTokens: number;
  filePath: string;
  tier: SizeTier;
};

type CheckModifiedFileSizesOptions = {
  cwd?: string;
  files?: string[];
};

export async function checkModifiedFileSizes(
  options: CheckModifiedFileSizesOptions = {},
): Promise<ModifiedFileSizeViolation[]> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const files = options.files ?? getModifiedFiles(cwd);

  return files
    .map((filePath) => path.normalize(filePath))
    .filter(isApplicationSourceFile)
    .map((filePath) => {
      const absolutePath = path.resolve(cwd, filePath);
      const estimatedTokens = Math.ceil(
        readFileSync(absolutePath).byteLength / 4,
      );
      const tier = getTier(estimatedTokens);

      if (tier === null) {
        return null;
      }

      return {
        estimatedTokens,
        filePath: path.relative(cwd, absolutePath),
        tier,
      };
    })
    .filter(
      (violation): violation is ModifiedFileSizeViolation => violation !== null,
    )
    .sort(
      (left, right) =>
        right.estimatedTokens - left.estimatedTokens ||
        left.filePath.localeCompare(right.filePath),
    );
}

export async function runModifiedFileSizeGuardrail(
  options: CheckModifiedFileSizesOptions = {},
): Promise<void> {
  const violations = await checkModifiedFileSizes(options);

  if (violations.length === 0) {
    return;
  }

  const lines = [
    "Modified file size guardrail found maintainability review candidates:",
    ...violations.map(
      (violation) =>
        `- ${violation.filePath}: ${violation.estimatedTokens} estimated tokens (tier ${violation.tier})`,
    ),
    "",
    "Interpret this as a maintainability signal, not a mechanical split rule.",
    "Tier 7000 should carry explicit review justification or a follow-up issue.",
    "Tier 10000 should be treated as a strong refactor candidate.",
  ];

  throw new Error(lines.join("\n"));
}

function getModifiedFiles(cwd: string) {
  const trackedChanges = readNullSeparatedGitOutput(
    cwd,
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACMR",
    "HEAD",
    "--",
  );
  const untrackedChanges = readNullSeparatedGitOutput(
    cwd,
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  );

  return [...new Set([...trackedChanges, ...untrackedChanges])];
}

function readNullSeparatedGitOutput(cwd: string, ...args: string[]) {
  const output = execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return output.split("\0").filter(Boolean);
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

function getTier(estimatedTokens: number): SizeTier | null {
  return sizeTiers.find((tier) => estimatedTokens >= tier) ?? null;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runModifiedFileSizeGuardrail().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

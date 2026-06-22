import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const appDirectory = path.resolve("app");
const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.test\.(ts|tsx)$/;

const tailwindPalette =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const utilityBoundary = String.raw`(?<![\w-])`;
const utilitySuffix = String.raw`[^\s"'` + "`" + String.raw`<>{}]+`;
const variantPrefix = String.raw`(?:[\w![\]/().-]+:)*`;

const hardcodedColorUtilityPattern = new RegExp(
  `${utilityBoundary}(?<utility>${variantPrefix}(?:bg|text|border|ring|stroke|fill|outline|accent|caret|from|via|to|decoration)-${tailwindPalette}-\\d{1,3}(?:/\\d{1,3})?)`,
  "g",
);
const spaceUtilityPattern = new RegExp(
  `${utilityBoundary}(?<utility>${variantPrefix}-?space-[xy]-${utilitySuffix})`,
  "g",
);

type RepoStyleRule = "no-tailwind-hardcoded-colors" | "prefer-gap-over-space";

export type RepoStyleViolation = {
  filePath: string;
  lineNumber: number;
  rule: RepoStyleRule;
  utility: string;
};

type RepoStyleException = {
  rule: RepoStyleRule;
  utility: string;
  filePath?: string;
  lineIncludes?: string;
  reason: string;
};

type CheckRepoStyleOptions = {
  files?: string[];
  rootDirectory?: string;
};

const repoStyleExceptions: RepoStyleException[] = [
  {
    filePath: path.join("app", "components", "ui", "avatar.tsx"),
    reason: "AvatarGroup uses negative overlap spacing intentionally.",
    rule: "prefer-gap-over-space",
    utility: "-space-x-2",
  },
];

export async function checkRepoStyle(
  options: CheckRepoStyleOptions = {},
): Promise<RepoStyleViolation[]> {
  const rootDirectory = options.rootDirectory ?? appDirectory;
  const files = options.files ?? getSourceFiles(rootDirectory);
  const relativeRoot = path.resolve(rootDirectory);

  return files.flatMap((filePath) => {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(relativeRoot, absolutePath);
    const repoRelativePath = path.relative(process.cwd(), absolutePath);
    const fileContents = readFileSync(absolutePath, "utf8");
    const lines = fileContents.split("\n");

    return lines.flatMap((line, index) => {
      const lineNumber = index + 1;

      return [
        ...findViolations({
          filePath: relativePath,
          line,
          lineNumber,
          pattern: hardcodedColorUtilityPattern,
          repoRelativePath,
          rule: "no-tailwind-hardcoded-colors",
        }),
        ...findViolations({
          filePath: relativePath,
          line,
          lineNumber,
          pattern: spaceUtilityPattern,
          repoRelativePath,
          rule: "prefer-gap-over-space",
        }),
      ];
    });
  });
}

export async function runRepoStyleGuardrail(): Promise<void> {
  const violations = await checkRepoStyle();

  if (violations.length === 0) {
    return;
  }

  const lines = [
    "Repo-style guardrail found violations:",
    ...violations.map(
      (violation) =>
        `- ${violation.filePath}:${violation.lineNumber} ${violation.rule} -> ${violation.utility}`,
    ),
  ];

  throw new Error(lines.join("\n"));
}

function findViolations(input: {
  filePath: string;
  line: string;
  lineNumber: number;
  pattern: RegExp;
  repoRelativePath: string;
  rule: RepoStyleRule;
}): RepoStyleViolation[] {
  const matches = Array.from(input.line.matchAll(input.pattern));

  return matches.flatMap((match) => {
    const utility = match.groups?.utility;

    if (!utility) {
      return [];
    }

    if (
      repoStyleExceptions.some((exception) =>
        matchesException(exception, {
          line: input.line,
          repoRelativePath: input.repoRelativePath,
          rule: input.rule,
          utility,
        }),
      )
    ) {
      return [];
    }

    return [
      {
        filePath: input.filePath,
        lineNumber: input.lineNumber,
        rule: input.rule,
        utility,
      },
    ];
  });
}

function matchesException(
  exception: RepoStyleException,
  input: {
    line: string;
    repoRelativePath: string;
    rule: RepoStyleRule;
    utility: string;
  },
) {
  return (
    exception.rule === input.rule &&
    exception.utility === input.utility &&
    (exception.filePath === undefined ||
      path.normalize(exception.filePath) ===
        path.normalize(input.repoRelativePath)) &&
    (exception.lineIncludes === undefined ||
      input.line.includes(exception.lineIncludes))
  );
}

function getSourceFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return getSourceFiles(entryPath);
      }

      if (
        !sourceFilePattern.test(entry.name) ||
        testFilePattern.test(entry.name) ||
        entry.name.endsWith(".d.ts")
      ) {
        return [];
      }

      return [entryPath];
    },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRepoStyleGuardrail().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

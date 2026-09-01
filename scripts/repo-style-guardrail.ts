import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appDirectory = path.resolve("app");
const sourceFilePattern = /\.(ts|tsx)$/;
const testFilePattern = /\.test\.(ts|tsx)$/;

const tailwindPalette =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const utilityBoundary = String.raw`(?<![\w-])`;
const utilitySuffix = String.raw`[^\s"'` + "`" + String.raw`<>{}]+`;
const variantPrefix = String.raw`(?:[\w![\]/().-]+:)*`;

const hardcodedColorUtilityPattern = new RegExp(
  `${utilityBoundary}(?<match>${variantPrefix}(?:bg|text|border|ring|stroke|fill|outline|accent|caret|from|via|to|decoration)-${tailwindPalette}-\\d{1,3}(?:/\\d{1,3})?)`,
  "g",
);
const spaceUtilityPattern = new RegExp(
  `${utilityBoundary}(?<match>${variantPrefix}-?space-[xy]-${utilitySuffix})`,
  "g",
);

/**
 * `rosterPersonStatus` —ui: "Estado de alta"— is owned by
 * `app/lib/roster/roster-person-status*`: the `active` boolean on `dancer` and
 * `professor` is compared there and nowhere else. The rule ended up stated five
 * different ways once, which is why the boundary is gated rather than merely
 * documented.
 *
 * The comparison form covers the Drizzle predicate, the raw-SQL twin's
 * identifier and a hand-written `alias.active = true`. Identifiers naming an
 * event are excluded: `event.active` is the Evento activo, an unrelated axis.
 */
const rosterPersonActiveComparisonPattern = new RegExp(
  String.raw`(?<match>(?:eq|ne)\(\s*(?![\w.]*[Ee]vent)[\w.]*\.active\s*,\s*(?:true|false)\s*\)` +
    String.raw`|sql\.identifier\(\s*["'` +
    "`" +
    String.raw`]active["'` +
    "`" +
    String.raw`]\s*\)` +
    String.raw`|(?![\w.]*[Ee]vent)\b\w+\.active\s*=\s*(?:true|false)\b)`,
  "g",
);

/**
 * The eligibility rule itself: `isSelectableForRoster` is the only place the
 * "active, or already linked to this coreografía" expression may be written.
 * Membership on the other side of the `||` is what distinguishes it from an
 * unrelated boolean or.
 */
const rosterPersonSelectableExpressionPattern = new RegExp(
  String.raw`(?<match>\.active\s*\|\|\s*[\w.]*\b(?:has|includes)\(` +
    String.raw`|\b(?:has|includes)\([^)]*\)\s*\|\|\s*[\w.]*\.active\b)`,
  "g",
);

type RepoStyleRule =
  | "no-tailwind-hardcoded-colors"
  | "prefer-gap-over-space"
  | "roster-person-status-owns-active-column"
  | "roster-person-status-owns-selectable-rule";

/** Why each rule exists, so a failure explains itself where it is read. */
const repoStyleRuleReasons: Record<RepoStyleRule, string> = {
  "no-tailwind-hardcoded-colors":
    "Colors come from the theme tokens, not from the Tailwind palette.",
  "prefer-gap-over-space":
    "Spacing between siblings is `gap-*` on the flex or grid parent.",
  "roster-person-status-owns-active-column":
    "Estado de alta is read through `app/lib/roster/roster-person-status.server.ts` (`activeRosterPerson`, `activeRosterPersonSql`, `rosterPersonStatusCondition`), never by comparing the `active` column here.",
  "roster-person-status-owns-selectable-rule":
    "Roster eligibility is `isSelectableForRoster` in `app/lib/roster/roster-person-status.shared.ts`, so a read cannot offer what a write will refuse.",
};

type RepoStyleRuleCheck = {
  pattern: RegExp;
  rule: RepoStyleRule;
};

export type RepoStyleViolation = {
  filePath: string;
  lineNumber: number;
  match: string;
  rule: RepoStyleRule;
};

/**
 * An exception with no `match` covers every match of its rule, which is what
 * makes `filePathPrefix` usable: a module that owns a concept is exempted with
 * one entry instead of one entry per occurrence per file.
 */
type RepoStyleException = {
  filePath?: string;
  filePathPrefix?: string;
  lineIncludes?: string;
  match?: string;
  reason: string;
  rule: RepoStyleRule;
};

type CheckRepoStyleOptions = {
  files?: string[];
  rootDirectory?: string;
};

const rosterPersonStatusOwnerDirectory = path.join("app", "lib", "roster");

const repoStyleExceptions: RepoStyleException[] = [
  {
    filePath: path.join("app", "components", "ui", "avatar.tsx"),
    match: "-space-x-2",
    reason: "AvatarGroup uses negative overlap spacing intentionally.",
    rule: "prefer-gap-over-space",
  },
  {
    filePathPrefix: rosterPersonStatusOwnerDirectory,
    reason:
      "The roster person status module is the owner of the `active` column and of its SQL twin.",
    rule: "roster-person-status-owns-active-column",
  },
  {
    filePathPrefix: rosterPersonStatusOwnerDirectory,
    reason:
      "The roster person status module is the owner of the roster-eligibility rule.",
    rule: "roster-person-status-owns-selectable-rule",
  },
];

const repoStyleRuleChecks: RepoStyleRuleCheck[] = [
  {
    pattern: hardcodedColorUtilityPattern,
    rule: "no-tailwind-hardcoded-colors",
  },
  {
    pattern: spaceUtilityPattern,
    rule: "prefer-gap-over-space",
  },
  {
    pattern: rosterPersonActiveComparisonPattern,
    rule: "roster-person-status-owns-active-column",
  },
  {
    pattern: rosterPersonSelectableExpressionPattern,
    rule: "roster-person-status-owns-selectable-rule",
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

      return repoStyleRuleChecks.flatMap((ruleCheck) =>
        findViolations({
          filePath: relativePath,
          line,
          lineNumber,
          repoRelativePath,
          ...ruleCheck,
        }),
      );
    });
  });
}

export async function runRepoStyleGuardrail(
  options: CheckRepoStyleOptions = {},
): Promise<void> {
  const violations = await checkRepoStyle(options);

  if (violations.length === 0) {
    return;
  }

  const lines = [
    "Repo-style guardrail found violations:",
    ...violations.map(
      (violation) =>
        `- ${violation.filePath}:${violation.lineNumber} ${violation.rule} -> ${violation.match}\n  ${repoStyleRuleReasons[violation.rule]}`,
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
  const patternMatches = Array.from(input.line.matchAll(input.pattern));

  return patternMatches.flatMap((patternMatch) => {
    const match = patternMatch.groups?.match;

    if (!match) {
      return [];
    }

    if (
      repoStyleExceptions.some((exception) =>
        matchesException(exception, {
          line: input.line,
          match,
          repoRelativePath: input.repoRelativePath,
          rule: input.rule,
        }),
      )
    ) {
      return [];
    }

    return [
      {
        filePath: input.filePath,
        lineNumber: input.lineNumber,
        match,
        rule: input.rule,
      },
    ];
  });
}

function matchesException(
  exception: RepoStyleException,
  input: {
    line: string;
    match: string;
    repoRelativePath: string;
    rule: RepoStyleRule;
  },
) {
  return (
    exception.rule === input.rule &&
    (exception.match === undefined || exception.match === input.match) &&
    (exception.filePath === undefined ||
      path.normalize(exception.filePath) ===
        path.normalize(input.repoRelativePath)) &&
    (exception.filePathPrefix === undefined ||
      isInsideDirectory(input.repoRelativePath, exception.filePathPrefix)) &&
    (exception.lineIncludes === undefined ||
      input.line.includes(exception.lineIncludes))
  );
}

function isInsideDirectory(filePath: string, directoryPath: string) {
  const relativePath = path.relative(
    path.resolve(directoryPath),
    path.resolve(filePath),
  );

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
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

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runRepoStyleGuardrail().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

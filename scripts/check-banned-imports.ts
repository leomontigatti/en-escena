import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { collectSourceFiles } from "./source-files";

// Retired dependencies stay retired.
//
// Removing a package from `package.json` is not what keeps it out: re-adding it
// is one `pnpm add` away, and nothing downstream objects — typecheck passes, the
// build passes, and the decision that removed it survives only in a closed
// issue. This guardrail is the one place that decision is enforceable, so the
// *reason* travels with the rule and is printed at the failure. It asserts a
// structural fact (which specifiers are imported), never the content of prose.

const scannedDirectories = ["app", "scripts"];
const sourceFilePattern = /\.(ts|tsx|mts|mjs)$/;

// Test files are excluded, matching `repo-style-guardrail.ts`. Two reasons, and
// the narrowing costs nothing: a specifier inside a test fixture string is
// indistinguishable from a real import without parsing (this file's own test
// would trip the rule), and a test that genuinely imported a retired package
// would fail loudly anyway — the package is not in the manifest to install.
const testFilePattern = /\.(test|test-support)\.(ts|tsx)$/;

/**
 * Import specifiers in every form the repo uses: `from "x"`, bare `import "x"`,
 * `await import("x")` and `require("x")`.
 */
const importSpecifierPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

type BannedImport = {
  /** Package root. A subpath import (`pkg/sub`) counts as the same package. */
  packageName: string;
  reason: string;
};

const bannedImports: BannedImport[] = [
  {
    packageName: "@supabase/supabase-js",
    reason:
      "En Escena left Supabase (ADR-0013, #582, #598). The credential provider built on this package was unreachable and was deleted; Better Auth owns credentials.",
  },
  {
    packageName: "@supabase/ssr",
    reason:
      "En Escena left Supabase (ADR-0013, #582, #598). The SSR cookie bridge built on this package was deleted; sessions are Better Auth cookies, and legacy `sb-*` cookies are cleared by app/lib/auth/legacy-session-cookies.server.ts without it.",
  },
];

export type BannedImportViolation = {
  filePath: string;
  lineNumber: number;
  reason: string;
  specifier: string;
};

type CheckBannedImportsOptions = {
  files?: string[];
  rootDirectory?: string;
};

export function findBannedImportsInSource(input: {
  contents: string;
  filePath: string;
}): BannedImportViolation[] {
  return input.contents.split("\n").flatMap((line, index) => {
    // Skip comment lines rather than stripping comments out of the whole file.
    // Stripping risks mangling a `//` inside a string literal, and the realistic
    // false positive is prose — a comment that *names* a retired package while
    // explaining why it is gone. Failing the build on that would make the
    // explanation expensive to write, which is the trap #630 warns about.
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      return [];
    }

    return Array.from(line.matchAll(importSpecifierPattern)).flatMap(
      (match) => {
        const specifier = match[1];
        const banned = bannedImports.find(
          ({ packageName }) =>
            specifier === packageName ||
            specifier.startsWith(`${packageName}/`),
        );

        if (!banned) {
          return [];
        }

        return [
          {
            filePath: input.filePath,
            lineNumber: index + 1,
            reason: banned.reason,
            specifier,
          },
        ];
      },
    );
  });
}

export async function checkBannedImports(
  options: CheckBannedImportsOptions = {},
): Promise<BannedImportViolation[]> {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const files =
    options.files ??
    scannedDirectories.flatMap((directory) =>
      collectSourceFiles({
        directoryPath: path.join(rootDirectory, directory),
        keeps: (fileName) =>
          sourceFilePattern.test(fileName) && !testFilePattern.test(fileName),
      }),
    );

  return files.flatMap((filePath) => {
    const absolutePath = path.resolve(rootDirectory, filePath);

    return findBannedImportsInSource({
      contents: readFileSync(absolutePath, "utf8"),
      filePath: path.relative(rootDirectory, absolutePath),
    });
  });
}

export async function runBannedImportsGuardrail(): Promise<void> {
  const violations = await checkBannedImports();

  if (violations.length === 0) {
    return;
  }

  const lines = [
    "Banned-import guardrail found violations:",
    ...violations.map(
      (violation) =>
        `- ${violation.filePath}:${violation.lineNumber} imports ${violation.specifier}\n  ${violation.reason}`,
    ),
    "",
    "If the decision behind one of these has genuinely been reversed, remove its entry from scripts/check-banned-imports.ts in the same PR that reintroduces the dependency, and say why.",
  ];

  throw new Error(lines.join("\n"));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runBannedImportsGuardrail().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

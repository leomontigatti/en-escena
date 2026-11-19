import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseSync } from "oxc-parser";
import { z } from "zod";

import {
  baseProblems,
  countProblems,
  type BaseList,
  type Counts,
  parseCounts,
  type Ratchet,
  readBaseList,
  trackedSourceFiles,
  writeCounts,
} from "./ratchet";

// The ban on type assertions, held by a ratchet.
//
// Lint rejects `as T` and `<T>x` (`typescript/consistent-type-assertions`,
// `never`; `as const` passes). The files that held one when the rule landed keep
// theirs, counted per file in the allowlist, and one `.oxlintrc.json` override
// turns the rule off for exactly those files. Oxlint has no baseline, so this
// check keeps both honest: each entry is the file's count, no entry rises above
// origin/master's, the override names exactly the listed files, and no comment
// disables the rule. `--write` rewrites the list and the override from the tree.

export const ruleName = "typescript/consistent-type-assertions";
const allowlistPath = "scripts/type-assertion-allowlist.json";
const lintConfigPath = ".oxlintrc.json";
const standards = "docs/agents/coding-standards.md#type-assertions";

const ratchet: Ratchet = {
  listPath: allowlistPath,
  describe: (n) => `${n} type assertion${n === 1 ? "" : "s"}`,
  instead: `Replace the assertion with a type guard, a schema or a typed helper (${standards})`,
  write: "`pnpm check:type-assertions --write`",
};

type LintOverride = { files: string[]; rules: Record<string, unknown> };

export type RatchetInput = {
  /** Assertions per file, as the rule counts them with no override. */
  counts: Counts;
  allowlist: Counts;
  base: BaseList;
  overrides: LintOverride[];
  disableComments: { file: string; line: number }[];
};

// A rule set to anything but an error, in an override, lets assertions through.
function exempts(setting: unknown): boolean {
  const severity: unknown = Array.isArray(setting) ? setting[0] : setting;

  return severity !== "deny" && severity !== "error" && severity !== 2;
}

function overrideProblems({ allowlist, overrides }: RatchetInput): string[] {
  const listed = new Set(Object.keys(allowlist));
  const exempted = new Set(
    overrides
      .filter(
        (override) =>
          ruleName in override.rules && exempts(override.rules[ruleName]),
      )
      .flatMap((override) => override.files),
  );
  const extra = [...exempted]
    .filter((file) => !listed.has(file))
    .sort()
    .map(
      (file) =>
        `${lintConfigPath} turns ${ruleName} off for ${file}, which ${allowlistPath} does not list. Only the override ${ratchet.write} writes from that list may exempt a file.`,
    );
  const missing = [...listed]
    .filter((file) => !exempted.has(file))
    .sort()
    .map(
      (file) =>
        `${file}: listed in ${allowlistPath}, but no ${lintConfigPath} override turns ${ruleName} off for it. Rewrite the override with ${ratchet.write}.`,
    );

  return [...extra, ...missing];
}

function disableProblems({ disableComments }: RatchetInput): string[] {
  return disableComments.map(
    ({ file, line }) =>
      `${file}:${line}: a disable comment that names ${ruleName}, or no rule at all. The rule takes none. ${ratchet.instead}.`,
  );
}

/** Every way the tree, its allowlist and the lint config disagree; empty when they agree. */
export function ratchetProblems(input: RatchetInput): string[] {
  return [
    ...countProblems(ratchet, input.counts, input.allowlist),
    ...baseProblems(ratchet, input.allowlist, input.base),
    ...overrideProblems(input),
    ...disableProblems(input),
  ];
}

const directive = /(?:oxlint|eslint)-disable(?:-next-line|-line)?\b/;

/**
 * The 1-based lines of `source` where a comment that would silence the rule has
 * its directive. Comments come from oxc's parser, the one oxlint reads them with,
 * so a comment ends where oxlint's does; `file` picks the language (`.tsx` parses
 * JSX).
 */
export function findDisableComments(source: string, file: string): number[] {
  return parseSync(file, source).comments.flatMap(({ value, start }) => {
    const found = directive.exec(value);

    if (!found) {
      return [];
    }

    const rules = value.slice(found.index + found[0].length);
    const silences =
      rules.includes("consistent-type-assertions") ||
      /^\s*(?:--|$)/.test(rules);

    // `start` is the comment's opening `//` or `/*`, two characters before `value`.
    return silences
      ? [source.slice(0, start + 2 + found.index).split("\n").length]
      : [];
  });
}

const lintConfigSchema = z.looseObject({
  overrides: z
    .array(
      z.looseObject({
        files: z.array(z.string()),
        rules: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
});

const reportSchema = z.object({
  diagnostics: z.array(z.object({ code: z.string(), filename: z.string() })),
});

// What the count skips. Kept here rather than read from `.oxlintrc.json`'s
// `ignorePatterns`, so a path added to lint's ignores is still counted and must
// be listed.
const notCounted = ["app/db/migrations/**"];

// Oxlint with only this rule, no overrides, no nested configs and no ignore files: the count is what
// the rule reports with the allowlist empty.
function countAssertions(files: string[]): Counts {
  const directory = mkdtempSync(path.join(tmpdir(), "type-assertions-"));
  const config = path.join(directory, "oxlintrc.json");

  writeFileSync(
    config,
    JSON.stringify({
      plugins: ["typescript"],
      categories: {},
      rules: { [ruleName]: ["error", { assertionStyle: "never" }] },
    }),
  );

  try {
    const linted = spawnSync(
      "node_modules/.bin/oxlint",
      [
        "-c",
        config,
        "--disable-nested-config",
        "--format",
        "json",
        "--no-ignore",
        ...files,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const { diagnostics } = reportSchema.parse(JSON.parse(linted.stdout));
    const counts: Counts = {};

    for (const { code, filename } of diagnostics) {
      if (code === "typescript(consistent-type-assertions)") {
        counts[filename] = (counts[filename] ?? 0) + 1;
      }
    }

    return counts;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const findAllDisableComments = (files: string[]) =>
  files.flatMap((file) =>
    findDisableComments(readFileSync(file, "utf8"), file).map((line) => ({
      file,
      line,
    })),
  );

// Plain JSON: a comment in the config throws here, before anything is written.
function readLintConfig() {
  const raw: unknown = JSON.parse(readFileSync(lintConfigPath, "utf8"));

  return { raw, config: lintConfigSchema.parse(raw) };
}

// The override is the one entry whose only rule turns this one off. The rest of
// the config is written back as it was read, in its own key order.
function writeOverride(
  lintConfig: ReturnType<typeof readLintConfig>,
  files: string[],
): void {
  const { raw, config } = lintConfig;
  // Each kept override is written as it was read, not as the schema parsed it,
  // so its keys stay in their own order.
  const rawOverrides = z
    .looseObject({ overrides: z.array(z.unknown()).default([]) })
    .parse(raw).overrides;
  const others = rawOverrides.filter((_, index) => {
    const rules = config.overrides[index]?.rules ?? {};

    return !(Object.keys(rules).length === 1 && ruleName in rules);
  });
  const overrides =
    files.length === 0
      ? others
      : [...others, { files, rules: { [ruleName]: "off" } }];

  writeFileSync(
    lintConfigPath,
    `${JSON.stringify({ ...Object(raw), overrides }, null, 2)}\n`,
  );
}

function main(): void {
  const files = trackedSourceFiles(notCounted);
  const counts = countAssertions(files);

  const lintConfig = readLintConfig();

  if (process.argv.includes("--write")) {
    writeOverride(
      lintConfig,
      Object.keys(counts).sort((left, right) => left.localeCompare(right)),
    );
    writeCounts(allowlistPath, counts);
    spawnSync("node_modules/.bin/prettier", [
      "--write",
      allowlistPath,
      lintConfigPath,
    ]);
    console.log(
      `${allowlistPath}: ${Object.keys(counts).length} files written from the tree.`,
    );

    return;
  }

  const problems = ratchetProblems({
    counts,
    allowlist: parseCounts(readFileSync(allowlistPath, "utf8")),
    base: readBaseList(allowlistPath),
    overrides: lintConfig.config.overrides,
    disableComments: findAllDisableComments(files),
  });

  if (problems.length === 0) {
    return;
  }

  console.error(
    [
      `Type assertions (${standards}):`,
      ...problems.map((problem) => `- ${problem}`),
    ].join("\n"),
  );
  process.exitCode = 1;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main();
}

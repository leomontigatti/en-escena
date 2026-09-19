import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  findSpanishMarkersInText,
  readGlossaryNouns,
} from "./check-comment-language";

// A PR title is a commit message. PRs here are squash-merged, so the title is
// what lands on `master` as the subject line — the only part of a PR's prose
// that outlives the PR, and the part `git log` is read through. #943 measured
// the three candidate PR-shape rules and kept this one: it is the only one that
// is a property of the title itself rather than a guess about the change.
//
// Two rules, because the subject is governed twice over. Conventional commits
// are already asked for by every prompt that writes a commit message, and the
// history obeys them; the one title that did not (#824, `worktree shadcn
// upstream sync`) is what this gate exists to catch. And engineering prose is
// English (CODING_STANDARDS, "Code Language") — a rule `check:comment-language`
// holds everywhere except here, because a PR title is in no file it scans.
//
// The language half is that same detector, not a copy of it: the heuristics,
// the glossary and the reserved terms all come from
// `scripts/check-comment-language.ts` through `findSpanishMarkersInText`, so a
// term added to `CONTEXT.md` reaches this gate the day it is added.

/**
 * The types the repo's history actually uses, read off
 * `git log origin/master --format=%s`. `style` is deliberately absent: not one
 * commit uses it, and a gate that accepts a type nobody writes is a gate that
 * would let a typo through under a different name.
 */
export const conventionalTypes = [
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "ci",
  "chore",
  "build",
  "revert",
];

/**
 * `type(scope)!: subject`, with the scope and the breaking-change `!` optional
 * and the subject required to start on a non-space. The separator is exactly
 * `: ` — `feat:no space` and a trailing-space-only subject are both the shape
 * that reads as a bare sentence once it is on `master`.
 *
 * The subject is the one capture group, so the same grammar that decides where
 * the prefix ends also decides where the subject begins: the two rules cannot
 * disagree about a title. Finding the separator by hand instead would split
 * `refactor(admin: finanzas): rename the helper` inside its scope, and hand the
 * language rule a `finanzas)` the scope rule promises never to read.
 */
const conventionalTitlePattern = new RegExp(
  `^(?:${conventionalTypes.join("|")})(?:\\([^)]+\\))?!?: (\\S[\\s\\S]*)`,
);

export type PrTitleViolation = {
  message: string;
  rule: "conventional prefix" | "english subject";
};

const acceptedExample =
  "feat(forms): keep views mounted when a submit fails unexpectedly";

/**
 * What the conventional grammar leaves after the prefix, which is also why the
 * scope is never language-checked: it is outside the capture. Scopes are
 * free-form here on purpose — `feat(finanzas)` is live in the history, and a
 * scope names a part of the domain, which is the one place the repo's Spanish
 * belongs.
 *
 * A title that is not a conventional commit has no prefix to strip, so the whole
 * of it is the subject: `worktree shadcn upstream sync` fails on the prefix
 * alone, and `Bailarín: agregar la vista` fails on both rules rather than have
 * the second one silently skipped by a colon that was never a separator.
 */
function subjectOf(title: string): string {
  return conventionalTitlePattern.exec(title)?.[1] ?? title;
}

export function checkPrTitle(input: {
  /** Empty turns the vocabulary instrument off; say so rather than omit it. */
  glossaryNouns: string[];
  title: string;
}): PrTitleViolation[] {
  const title = input.title.trim();
  const violations: PrTitleViolation[] = [];

  if (!conventionalTitlePattern.test(title)) {
    violations.push({
      message:
        `The PR title is not a conventional commit: "${title}". ` +
        `It is squash-merged into \`master\` as the commit subject, so it needs a \`type(scope): subject\` prefix — ` +
        `one of ${conventionalTypes.join(", ")}, an optional \`(scope)\`, an optional \`!\`, then \`: \` and the subject. ` +
        `Accepted: "${acceptedExample}".`,
      rule: "conventional prefix",
    });
  }

  const markers = findSpanishMarkersInText({
    glossaryNouns: input.glossaryNouns,
    text: subjectOf(title),
  });

  if (markers.length > 0) {
    violations.push({
      message:
        `The PR title's subject is not English (matched ${markers.join(", ")}): "${title}". ` +
        "Engineering prose is English (CODING_STANDARDS, 'Code Language'); the scope is free-form and is not checked. " +
        "Naming a Spanish term is still fine — quote or backtick it, and it is the data it is. " +
        `Accepted: "${acceptedExample}".`,
      rule: "english subject",
    });
  }

  return violations;
}

/**
 * Usage: `pnpm check:pr-title "<title>"`, or with `PR_TITLE` set and no
 * argument — which is how the workflow passes it, since interpolating the title
 * into a `run:` block is the `template-injection` a PR author controls.
 */
function runPrTitleGate(): void {
  const title = process.argv[2] ?? process.env.PR_TITLE;
  const errorPrefix = process.env.GITHUB_ACTIONS === "true" ? "::error::" : "";

  if (title === undefined) {
    console.error(
      `${errorPrefix}No PR title given. Pass it as the first argument or set PR_TITLE.`,
    );
    process.exitCode = 1;
    return;
  }

  const violations = checkPrTitle({
    glossaryNouns: readGlossaryNouns(process.cwd()),
    title,
  });

  for (const violation of violations) {
    console.error(`${errorPrefix}${violation.rule}: ${violation.message}`);
  }

  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runPrTitleGate();
}

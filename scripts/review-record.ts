import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// The review tier of a diff, and the record that says its review ran.
//
// Step 5 of the `implement` skill tiers the in-session review by risk. The tier
// used to be the agent's call and the review left no trace on the PR, so a
// skipped review and a fix nobody reviewed looked the same as a clean one
// (#1615, #1627: bugs only CodeRabbit caught). `pnpm review:tier` derives the
// tier from the changed paths, and `pnpm check:review-record` fails a PR whose
// body does not record the reviewers that tier requires, or whose branch gained
// a code commit after the commit the record names.
//
// The record is written by the agent, so it proves nothing on its own: what the
// check buys is that a skipped review shows on the PR instead of passing quietly.

export type ReviewTier = "full" | "readback+correctness" | "readback";

const tierRank: Record<ReviewTier, number> = {
  full: 2,
  "readback+correctness": 1,
  readback: 0,
};

/**
 * The areas `implement` step 5 sends to the full review. A term defined in
 * `GLOSSARY.md` is the one entry no path can see: the agent raises the tier for
 * it by hand, and the check accepts a raised tier.
 */
const fullTierAreas: { area: string; pattern: RegExp }[] = [
  {
    area: "money",
    pattern:
      /^app\/(lib\/(finances|prices|seminar-prices|comprobantes|admin\/finances)|features\/admin\/(finances|payments|prices|seminar-prices|comprobantes)|features\/portal\/(finances|payments))\/|^app\/routes\/[^/]*(finanzas|pagos|precios|comprobantes)|^app\/db\/schema\/(finances|prices|comprobantes)\.ts$/,
  },
  {
    area: "results or judging",
    pattern:
      /^app\/(lib\/(judging|grand-final|presentations)|features\/(judging|vote|audit)|features\/admin\/(results|presentations|grand-final)|features\/portal\/results)\/|^app\/routes\/[^/]*(resultados|juzgamiento|votar|auditoria|gran-final|presentaciones)|^app\/db\/schema\/(judging|grand-final|presentations)\.ts$/,
  },
  {
    area: "auth",
    pattern:
      /^app\/(lib\/auth|lib\/admin\/users|features\/admin\/users)\/|^app\/routes\/(api\.auth|ingresar|salir|cambiar-contrasena|recuperar-acceso|registro|administracion\.usuarios)|^app\/db\/schema\/access\.ts$/,
  },
  { area: "migration", pattern: /^app\/db\/migrations\// },
  {
    area: "script that deletes or overwrites",
    pattern:
      /^scripts\/(restore-|staging-reset|refresh-local-db-from-production|reseed-storage|backup-storage|worktree-db|worktree-sweep|unexpected-error-(maintenance|retention)|migrate\.mjs|docker-entrypoint)/,
  },
];

/**
 * Paths that change no runtime behaviour: docs, and agent or editor settings.
 * A diff made only of these keeps the readback alone. CI workflows are not here:
 * a workflow runs, and the correctness axis is cheap next to a broken deploy.
 */
const noBehaviourPattern =
  /\.md$|^docs\/|^\.agents\/|^\.claude\/|^\.codex\/|^\.vscode\/|^\.coderabbit\.yaml$|^\.github\/labels\.json$/;

export function tierOf(paths: string[]): {
  reasons: string[];
  tier: ReviewTier;
} {
  const reasons = paths.flatMap((changedPath) => {
    const match = fullTierAreas.find(({ pattern }) =>
      pattern.test(changedPath),
    );
    return match ? [`${match.area}: ${changedPath}`] : [];
  });

  if (reasons.length > 0) {
    return { reasons, tier: "full" };
  }

  return {
    reasons: [],
    tier: paths.every((changedPath) => noBehaviourPattern.test(changedPath))
      ? "readback"
      : "readback+correctness",
  };
}

export type ReviewModel = "luna" | "opus" | "sol";

type RecordedAxis = {
  axis: "correctness" | "readback" | "spec" | "standards";
  model: ReviewModel;
  skipped: boolean;
};

export type ReviewRecord = {
  axes: RecordedAxis[];
  reviewed: string;
  tier: ReviewTier;
};

const modelNames: Record<ReviewModel, string> = {
  luna: "Luna",
  opus: "Opus",
  sol: "Sol",
};

/**
 * What each tier requires. The full tier runs correctness on both model
 * families, a trial that compares them (CORRECTNESS.md in the `code-review` skill); the middle tier
 * takes either, since the reviewer is the family the implementer is not.
 */
const requirements: Record<
  ReviewTier,
  { axis: RecordedAxis["axis"]; model?: ReviewModel }[]
> = {
  full: [
    { axis: "standards" },
    { axis: "spec" },
    { axis: "correctness", model: "sol" },
    { axis: "correctness", model: "opus" },
  ],
  "readback+correctness": [{ axis: "readback" }, { axis: "correctness" }],
  readback: [{ axis: "readback" }],
};

function requirementLabel(requirement: {
  axis: string;
  model?: ReviewModel;
}): string {
  return requirement.model
    ? `${requirement.axis} (${modelNames[requirement.model]})`
    : requirement.axis;
}

export function requiredAxes(tier: ReviewTier): string[] {
  return requirements[tier].map(requirementLabel);
}

const reviewSectionPattern = /^## Review[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const tierLinePattern =
  /^Tier:\s*`?(full|readback\+correctness|readback)`?\s*,\s*reviewed\s+`?([0-9a-f]{7,40})`?/im;
const axisLinePattern =
  /^[-*]\s+(readback|standards|spec|correctness)\s*\((sol|opus|luna)\)\s*:\s*(.*)$/gim;

/**
 * The `## Review` section of a PR body, in the shape the `pr` skill writes:
 * `Tier: <tier>, reviewed <sha>`, then one `- <axis> (<model>): <outcome>`
 * line per reviewer. An outcome that starts with "skipped" counts as recorded
 * and is reported as a warning.
 */
export function parseReviewRecord(body: string): ReviewRecord | null {
  const section = reviewSectionPattern.exec(body.replaceAll("\r\n", "\n"))?.[1];
  const tierLine = section === undefined ? null : tierLinePattern.exec(section);

  if (section === undefined || !tierLine) {
    return null;
  }

  return {
    axes: [...section.matchAll(axisLinePattern)].map((line) => ({
      axis: line[1].toLowerCase() as RecordedAxis["axis"],
      model: line[2].toLowerCase() as ReviewModel,
      skipped: /^skipped\b/i.test(line[3].trim()),
    })),
    reviewed: tierLine[2],
    tier: tierLine[1] as ReviewTier,
  };
}

type LaterCommit = { paths: string[]; sha: string };

function reviewerFindings(
  record: ReviewRecord,
  tier: ReviewTier,
): { violations: string[]; warnings: string[] } {
  const violations: string[] = [];
  const warnings: string[] = [];

  for (const requirement of requirements[tier]) {
    const recorded = record.axes.filter(
      (axis) =>
        axis.axis === requirement.axis &&
        (requirement.model === undefined || axis.model === requirement.model),
    );

    if (recorded.length === 0) {
      violations.push(
        `Tier ${tier} needs a ${requirementLabel(requirement)} line in the record.`,
      );
    } else if (recorded.every((axis) => axis.skipped)) {
      warnings.push(`${requirementLabel(recorded[0])} is recorded as skipped.`);
    }
  }

  return { violations, warnings };
}

function unreviewedCommits(
  reviewed: string,
  laterCommits: LaterCommit[] | null,
): string[] {
  if (laterCommits === null) {
    return [
      `The reviewed commit ${reviewed} is not on this branch. After a rebase, record the commit that now holds what was reviewed.`,
    ];
  }

  return laterCommits.flatMap((commit) => {
    const behaviourPaths = commit.paths.filter(
      (changedPath) => !noBehaviourPattern.test(changedPath),
    );

    return behaviourPaths.length === 0
      ? []
      : [
          `Commit ${commit.sha} changes ${behaviourPaths.join(", ")} after the reviewed commit ${reviewed}. Run the correctness axis on \`git diff ${reviewed}..HEAD\` and record the new head.`,
        ];
  });
}

export function checkReviewRecord(input: {
  changedPaths: string[];
  /** The branch's own commits after the reviewed one; null when it is not on the branch. */
  laterCommits: LaterCommit[] | null;
  record: ReviewRecord | null;
}): { violations: string[]; warnings: string[] } {
  const { record } = input;
  const derived = tierOf(input.changedPaths);

  if (!record) {
    return {
      violations: [
        `The PR body has no review record. Add a \`## Review\` section with \`Tier: ${derived.tier}, reviewed <sha>\` and a line per reviewer: ${requiredAxes(derived.tier).join(", ")} (the \`pr\` skill).`,
      ],
      warnings: [],
    };
  }

  const lowered = tierRank[record.tier] < tierRank[derived.tier];
  const reviewers = reviewerFindings(
    record,
    lowered ? derived.tier : record.tier,
  );

  return {
    violations: [
      ...(lowered
        ? [
            `The record says tier ${record.tier}, but the diff is ${derived.tier}: ${derived.reasons.join("; ")}.`,
          ]
        : []),
      ...reviewers.violations,
      ...unreviewedCommits(record.reviewed, input.laterCommits),
    ],
    warnings: reviewers.warnings,
  };
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function lines(output: string): string[] {
  return output.split("\n").filter((line) => line.length > 0);
}

/**
 * `pnpm review:tier [base]`: the tier of everything since `base` (default
 * `origin/master`), uncommitted and untracked files included, since step 5
 * reviews before the commit.
 */
function printTier(base: string): void {
  const paths = [
    ...new Set([
      ...lines(git(["diff", "--name-only", `${base}...HEAD`])),
      ...lines(git(["diff", "--name-only", "HEAD"])),
      ...lines(git(["ls-files", "--others", "--exclude-standard"])),
    ]),
  ];
  const { reasons, tier } = tierOf(paths);

  console.log(`Tier: ${tier}`);
  for (const reason of reasons) {
    console.log(`  ${reason}`);
  }
  console.log(`Reviewers: ${requiredAxes(tier).join(", ")}`);
}

/**
 * The branch's own commits after the reviewed one: merges and what they bring
 * in from the base are not the branch's code. Null when the reviewed commit is
 * not an ancestor of the head, or not a commit at all.
 */
function commitsAfter(
  reviewed: string,
  base: string,
  head: string,
): LaterCommit[] | null {
  try {
    git(["merge-base", "--is-ancestor", reviewed, head]);
  } catch {
    return null;
  }

  return lines(
    git(["rev-list", "--no-merges", `${reviewed}..${head}`, `^${base}`]),
  ).map((sha) => ({
    paths: lines(
      git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]),
    ),
    sha: sha.slice(0, 7),
  }));
}

/**
 * `pnpm check:review-record`, run by `review-record.yml` with `PR_BODY`,
 * `BASE_SHA`, `HEAD_SHA` and `PR_AUTHOR` in the environment.
 */
function runCheck(): void {
  const {
    BASE_SHA: base,
    HEAD_SHA: head,
    PR_AUTHOR: author,
    PR_BODY: body,
  } = process.env;

  if (base === undefined || head === undefined || body === undefined) {
    report({
      violations: ["Set PR_BODY, BASE_SHA and HEAD_SHA."],
      warnings: [],
    });
    return;
  }

  // Dependabot's PRs are reviewed by nobody in a session; CI and the user's merge are their gate.
  if (author === "dependabot[bot]") {
    console.log("Dependabot PR: no review record expected.");
    return;
  }

  const record = parseReviewRecord(body);
  report(
    checkReviewRecord({
      changedPaths: lines(git(["diff", "--name-only", `${base}...${head}`])),
      laterCommits: record ? commitsAfter(record.reviewed, base, head) : [],
      record,
    }),
  );
}

function report({
  violations,
  warnings,
}: {
  violations: string[];
  warnings: string[];
}): void {
  const errorPrefix = process.env.GITHUB_ACTIONS === "true" ? "::error::" : "";
  const warningPrefix =
    process.env.GITHUB_ACTIONS === "true" ? "::warning::" : "warning: ";

  for (const warning of warnings) {
    console.log(`${warningPrefix}${warning}`);
  }
  for (const violation of violations) {
    console.error(`${errorPrefix}${violation}`);
  }
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  if (process.argv[2] === "tier") {
    printTier(process.argv[3] ?? "origin/master");
  } else {
    runCheck();
  }
}

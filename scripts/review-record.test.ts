import { describe, expect, test } from "vitest";

import {
  checkReviewRecord,
  parseReviewRecord,
  requiredAxes,
  tierOf,
} from "./review-record";

function recordBody(lines: string[]): string {
  return [
    "## Summary",
    "",
    "Text.",
    "",
    "## Review",
    "",
    ...lines,
    "",
    "## Merge Danger",
    "",
  ].join("\n");
}

const fullRecord = recordBody([
  "Tier: full, reviewed 1a2b3c4",
  "",
  "- standards (Sol): 1 finding, 1 fixed",
  "- spec (Sol): no findings",
  "- correctness (Sol): 2 findings, 1 fixed, 1 declined; 1 also found by Opus",
  "- correctness (Opus): 1 finding, 1 fixed; 1 also found by Sol",
]);

describe("review tier", () => {
  test("a docs or agent-configuration diff gets the readback alone", () => {
    expect(
      tierOf([
        "docs/agents/workflows.md",
        ".agents/skills/pr/SKILL.md",
        "GLOSSARY.md",
      ]).tier,
    ).toBe("readback");
  });

  test("any other code adds the correctness axis", () => {
    expect(tierOf(["docs/x.md", "app/components/ui/button.tsx"]).tier).toBe(
      "readback+correctness",
    );
    expect(tierOf([".github/workflows/ci.yml"]).tier).toBe(
      "readback+correctness",
    );
  });

  // #1615 and #1627 were judging changes whose bugs only CodeRabbit caught.
  test("money, judging, auth, migrations and destructive scripts are full", () => {
    for (const path of [
      "app/lib/finances/balance.server.ts",
      "app/routes/administracion.pagos_.$paymentId.tsx",
      "app/features/admin/presentations/scores/drafts.ts",
      "app/features/admin/presentations/list/server.ts",
      "app/lib/auth/user-role.shared.ts",
      "app/db/migrations/0042_add_column.sql",
      "app/db/schema/comprobantes.ts",
      "scripts/staging-reset.sh",
    ]) {
      expect(tierOf([path]), path).toMatchObject({ tier: "full" });
    }
  });

  test("names the paths that put a diff in the full tier", () => {
    expect(
      tierOf([
        "app/components/ui/button.tsx",
        "app/lib/judging/score.server.ts",
      ]).reasons,
    ).toEqual(["results or judging: app/lib/judging/score.server.ts"]);
  });

  test("an empty diff is the readback tier", () => {
    expect(tierOf([]).tier).toBe("readback");
  });
});

describe("review record parsing", () => {
  test("parses the tier, the reviewed commit and each axis", () => {
    expect(parseReviewRecord(fullRecord)).toEqual({
      axes: [
        { axis: "standards", model: "sol", skipped: false },
        { axis: "spec", model: "sol", skipped: false },
        { axis: "correctness", model: "sol", skipped: false },
        { axis: "correctness", model: "opus", skipped: false },
      ],
      reviewed: "1a2b3c4",
      tier: "full",
    });
  });

  test("reads no record from a body without a Review section", () => {
    expect(
      parseReviewRecord("## Summary\n\nTier: full, reviewed 1a2b3c4\n"),
    ).toBeNull();
  });
});

describe("reviewers a tier requires", () => {
  test("a full record with every axis passes", () => {
    expect(
      checkReviewRecord({
        changedPaths: ["app/lib/judging/score.server.ts"],
        laterCommits: [],
        record: parseReviewRecord(fullRecord),
      }),
    ).toEqual({ violations: [], warnings: [] });
  });

  test("fails a body with no record", () => {
    expect(
      checkReviewRecord({ changedPaths: [], laterCommits: [], record: null })
        .violations,
    ).toHaveLength(1);
  });

  test("the full tier needs both correctness reviewers", () => {
    const record = parseReviewRecord(
      recordBody([
        "Tier: full, reviewed 1a2b3c4",
        "- standards (Sol): no findings",
        "- spec (Sol): no findings",
        "- correctness (Opus): no findings",
      ]),
    );

    expect(
      checkReviewRecord({
        changedPaths: ["app/lib/auth/user-role.shared.ts"],
        laterCommits: [],
        record,
      }).violations,
    ).toEqual([expect.stringContaining("correctness (Sol)")]);
  });

  test("a record may raise the tier but never lower it", () => {
    const lowered = parseReviewRecord(
      recordBody([
        "Tier: readback+correctness, reviewed 1a2b3c4",
        "- readback (Luna): nothing surprising",
        "- correctness (Sol): no findings",
      ]),
    );

    expect(
      checkReviewRecord({
        changedPaths: ["app/db/migrations/0042_add_column.sql"],
        laterCommits: [],
        record: lowered,
      }).violations,
    ).toContainEqual(
      expect.stringContaining(
        "migration: app/db/migrations/0042_add_column.sql",
      ),
    );
    expect(
      checkReviewRecord({
        changedPaths: ["docs/x.md"],
        laterCommits: [],
        record: lowered,
      }),
    ).toEqual({ violations: [], warnings: [] });
  });

  test("the middle tier takes either correctness reviewer", () => {
    const record = parseReviewRecord(
      recordBody([
        "Tier: readback+correctness, reviewed 1a2b3c4",
        "- readback (Luna): nothing surprising",
        "- correctness (Opus): no findings",
      ]),
    );

    expect(
      checkReviewRecord({
        changedPaths: ["app/root.tsx"],
        laterCommits: [],
        record,
      }),
    ).toEqual({ violations: [], warnings: [] });
  });
});

describe("commits after the review", () => {
  // The #1627 race came in with a fix made after the review ran.
  test("fails a code commit made after the reviewed one", () => {
    expect(
      checkReviewRecord({
        changedPaths: ["app/lib/judging/score.server.ts"],
        laterCommits: [
          { paths: ["docs/domain/judging.md"], sha: "aaaaaaa" },
          { paths: ["app/lib/judging/score.server.ts"], sha: "bbbbbbb" },
        ],
        record: parseReviewRecord(fullRecord),
      }).violations,
    ).toEqual([expect.stringContaining("bbbbbbb")]);
  });

  test("fails a reviewed commit that is not on the branch", () => {
    expect(
      checkReviewRecord({
        changedPaths: ["docs/x.md"],
        laterCommits: null,
        record: parseReviewRecord(fullRecord),
      }).violations,
    ).toEqual([expect.stringContaining("1a2b3c4")]);
  });
});

describe("skipped and listed reviewers", () => {
  test("a skipped axis counts but warns", () => {
    const record = parseReviewRecord(
      recordBody([
        "Tier: full, reviewed 1a2b3c4",
        "- standards (Sol): no findings",
        "- spec (Sol): skipped, no issue",
        "- correctness (Sol): no findings",
        "- correctness (Opus): no findings",
      ]),
    );

    expect(
      checkReviewRecord({ changedPaths: [], laterCommits: [], record }),
    ).toEqual({
      violations: [],
      warnings: [expect.stringContaining("spec (Sol)")],
    });
  });

  test("lists the axes each tier requires", () => {
    expect(requiredAxes("readback")).toEqual(["readback"]);
    expect(requiredAxes("readback+correctness")).toEqual([
      "readback",
      "correctness",
    ]);
    expect(requiredAxes("full")).toEqual([
      "standards",
      "spec",
      "correctness (Sol)",
      "correctness (Opus)",
    ]);
  });
});

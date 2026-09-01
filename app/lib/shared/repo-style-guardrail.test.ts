import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  checkRepoStyle,
  runRepoStyleGuardrail,
} from "../../../scripts/repo-style-guardrail";

describe("repo style check", () => {
  test("flags hardcoded Tailwind colors and space utilities while allowing explicit exceptions", async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "repo-style-guardrail-"),
    );

    try {
      await writeFile(
        path.join(tempRoot, "feature.tsx"),
        [
          'export const Feature = () => <div className="bg-slate-50 space-y-4 text-foreground" />;',
          'export const AvatarGroup = () => <div className="flex -space-x-2" data-layout="overlap" />;',
        ].join("\n"),
      );

      const violations = await checkRepoStyle({
        rootDirectory: tempRoot,
        files: [path.join(tempRoot, "feature.tsx")],
      });

      expect(violations).toEqual([
        expect.objectContaining({
          filePath: "feature.tsx",
          rule: "no-tailwind-hardcoded-colors",
          match: "bg-slate-50",
        }),
        expect.objectContaining({
          filePath: "feature.tsx",
          rule: "prefer-gap-over-space",
          match: "space-y-4",
        }),
        expect.objectContaining({
          filePath: "feature.tsx",
          rule: "prefer-gap-over-space",
          match: "-space-x-2",
        }),
      ]);
      expect(violations).toHaveLength(3);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("flags the Estado de alta column and the inlined selectable rule outside their owner", async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "repo-style-guardrail-roster-"),
    );

    try {
      await writeFile(
        path.join(tempRoot, "some-list.server.ts"),
        [
          "const where = and(eq(dancers.active, true), eq(dancers.academyId, academyId));",
          'const archived = sql`${sql.identifier("d")}.${sql.identifier("active")} = false`;',
          "const selectable = people.filter((p) => p.active || linkedIds.has(p.id));",
          "const alsoSelectable = people.filter((p) => linkedIds.has(p.id) || p.active);",
          'const unrelated = event.active || temporalState.value !== "finished";',
          "const projection = { active: dancers.active };",
        ].join("\n"),
      );

      const violations = await checkRepoStyle({
        rootDirectory: tempRoot,
        files: [path.join(tempRoot, "some-list.server.ts")],
      });

      expect(violations).toEqual([
        expect.objectContaining({
          lineNumber: 1,
          rule: "roster-person-status-owns-active-column",
        }),
        expect.objectContaining({
          lineNumber: 2,
          rule: "roster-person-status-owns-active-column",
        }),
        expect.objectContaining({
          lineNumber: 3,
          rule: "roster-person-status-owns-selectable-rule",
        }),
        expect.objectContaining({
          lineNumber: 4,
          rule: "roster-person-status-owns-selectable-rule",
        }),
      ]);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("exempts the roster person status owner with one path-prefix entry", async () => {
    const violations = await checkRepoStyle({
      files: [
        path.join("app", "lib", "roster", "roster-person-status.server.ts"),
        path.join("app", "lib", "roster", "roster-person-status.shared.ts"),
      ],
    });

    expect(violations).toEqual([]);
  });

  test("explains why each rule exists when it fails", async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "repo-style-guardrail-reason-"),
    );

    try {
      await writeFile(
        path.join(tempRoot, "offender.ts"),
        "const where = eq(professors.active, true);\n",
      );

      await expect(
        runRepoStyleGuardrail({
          rootDirectory: tempRoot,
          files: [path.join(tempRoot, "offender.ts")],
        }),
      ).rejects.toThrow(/roster-person-status\.server\.ts/);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("keeps the current app code clean under the guardrail", async () => {
    const violations = await checkRepoStyle();

    expect(violations).toEqual([]);
  });

  test("ships the repo-style command contract in package scripts and agent docs", async () => {
    const [packageJson, workflowDoc, codebaseMap] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("docs/agents/workflows.md", "utf8"),
      readFile("docs/agents/codebase-map.md", "utf8"),
    ]);

    expect(packageJson).toContain(
      '"check:repo-styles": "node --import tsx scripts/repo-style-guardrail.ts"',
    );
    expect(workflowDoc).toContain("`pnpm check:repo-styles`");
    expect(workflowDoc).toContain("repo-style");
    expect(codebaseMap).toContain("`pnpm check:repo-styles`");
    await expect(runRepoStyleGuardrail()).resolves.toBeUndefined();
  });
});

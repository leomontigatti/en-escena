import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const requiredSections = [
  "# Request Performance Refactor Plan",
  "## Current Validation Workflow",
  "## Critical Administración Routes",
  "## Critical Portal Routes",
  "## Current Submit Patterns",
  "## Revalidated Assumptions",
];

const requiredRouteReferences = [
  "`app/routes/administracion.tsx`",
  "`app/routes/administracion.eventos_.$eventId.tsx`",
  "`app/routes/portal.tsx`",
  "`app/routes/portal.coreografias.tsx`",
  "`app/routes/portal.coreografias_.$choreographyId.tsx`",
];

const requiredAssumptions = [
  "The local plan file referenced by PRD #130 did not exist",
  "`createValidatedNativeSubmitHandler` still ends in `formElement.submit()`",
  "`npm run typecheck` remains the required TypeScript entrypoint",
  "`npm run test:db` is the final reliable database-backed validation path",
];

describe("request performance refactor plan", () => {
  test("documents the current validation workflow and route inventory", async () => {
    const plan = await readFile(
      "docs/agents/request-performance-refactor-plan.md",
      "utf8",
    );

    for (const section of requiredSections) {
      expect(plan).toContain(section);
    }

    for (const routeReference of requiredRouteReferences) {
      expect(plan).toContain(routeReference);
    }

    for (const assumption of requiredAssumptions) {
      expect(plan).toContain(assumption);
    }
  });
});

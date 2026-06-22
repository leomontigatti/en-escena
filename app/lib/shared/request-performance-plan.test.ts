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

const workflowRuleRequirements = [
  "## Request Performance and Loading",
  "Measure before diagnosing latency.",
  "loader or action timing around the real route seam",
  "auth",
  "event/context lookup",
  "main query or mutation",
  "serialization/readiness work",
  "revalidation follow-up",
  "`docs/agents/request-performance-refactor-plan.md`",
  "`npm run test`",
];

const styleGuideRuleRequirements = [
  "## Pending, loading y transiciones",
  "Usar estado pendiente en el botón",
  "spinner inline",
  "Mantener las filas o resultados actuales visibles",
  "Usar skeletons solo",
  "No usar skeletons",
  "View Transitions",
];

const codingStandardsRuleRequirements = [
  "## File Size And Boundaries",
  "soft maintainability limit around 5500 tokens",
  "`bytes / 4`",
  "clear module boundary",
  "loader/action server module",
  "form controller",
  "table column definitions",
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

  test("documents permanent performance, loading, and maintainability rules in the repo docs", async () => {
    const [workflowDoc, styleGuide, codingStandards] = await Promise.all([
      readFile("docs/agents/codex-workflows.md", "utf8"),
      readFile("docs/agents/style-guide.md", "utf8"),
      readFile("docs/agents/coding-standards.md", "utf8"),
    ]);

    for (const rule of workflowRuleRequirements) {
      expect(workflowDoc).toContain(rule);
    }

    for (const rule of styleGuideRuleRequirements) {
      expect(styleGuide).toContain(rule);
    }

    for (const rule of codingStandardsRuleRequirements) {
      expect(codingStandards).toContain(rule);
    }
  });
});

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

const permanentRuleDocuments = [
  {
    path: "docs/agents/codex-workflows.md",
    requiredText: [
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
    ],
  },
  {
    path: "docs/agents/style-guide.md",
    requiredText: [
      "## Pending, loading y transiciones",
      "Usar estado pendiente en el botón",
      "spinner inline",
      "Mantener las filas o resultados actuales visibles",
      "Usar skeletons solo",
      "No usar skeletons",
      "View Transitions",
    ],
  },
  {
    path: "docs/agents/coding-standards.md",
    requiredText: [
      "## File Size And Boundaries",
      "soft maintainability limit around 5500 tokens",
      "`bytes / 4`",
      "Exclude docs, generated files, lockfiles, and public assets",
      "clear module boundary",
      "loader/action server module",
      "form controller",
      "presentational view",
      "table column definitions",
      "test fixtures or factory data",
      "`docs/agents/codex-workflows.md`",
      "`npm run typecheck`",
      "`npm run test`",
    ],
  },
];

const expectTextToContainAll = (text: string, requiredText: string[]) => {
  for (const requiredPhrase of requiredText) {
    expect(text).toContain(requiredPhrase);
  }
};

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
    const documents = await Promise.all(
      permanentRuleDocuments.map(async (document) => ({
        requiredText: document.requiredText,
        text: await readFile(document.path, "utf8"),
      })),
    );

    for (const document of documents) {
      expectTextToContainAll(document.text, document.requiredText);
    }
  });
});

import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const requiredSections = [
  "# Request Performance Refactor Plan",
  "## Current Validation Workflow",
  "## Critical Administración Routes",
  "## Critical Portal Routes",
  "## Current Submit Patterns",
  "## View Transition Evaluation",
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
  "`pnpm typecheck` remains the required TypeScript entrypoint",
  "`pnpm test:db` is the final reliable database-backed validation path",
];

const requiredViewTransitionDecisions = [
  "`Portal / Bailarines`: list -> detail and detail -> list should animate.",
  "`Portal / Profesores`: list -> detail and detail -> list should animate.",
  "`Portal / Coreografías`: list -> detail should not animate.",
  "Do not add a root or shell-level route transition.",
  "shared-element transition name with a 160ms default",
  "reduced-motion fallback",
];

const permanentRuleDocuments = [
  {
    path: "docs/agents/workflows.md",
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
      "Current form-submit standard",
      "Use `useSubmit`",
      "Use `useFetcher.submit`",
      "Shared RHF + React Router submit helpers should pass `FormData`",
      "`pnpm test`",
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
      "Los formularios RHF no deben terminar en `form.submit()`",
      "React Router con `useSubmit`, `useFetcher.submit`",
      "deben construir y enviar `FormData`",
    ],
  },
  {
    path: "docs/agents/coding-standards.md",
    requiredText: [
      "## File Size And Boundaries",
      "maintainability rule that protects module boundaries",
      "5500 estimated tokens",
      "`pnpm check:file-tokens`",
      "`bytes / 4`",
      "Exclude docs, generated files, lockfiles, and public assets",
      "clear module boundary",
      "loader/action server module",
      "form controller",
      "presentational view",
      "table column definitions",
      "test fixtures or factory data",
      "`docs/agents/workflows.md`",
      "`pnpm typecheck`",
      "`pnpm test`",
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

    for (const decision of requiredViewTransitionDecisions) {
      expect(plan).toContain(decision);
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

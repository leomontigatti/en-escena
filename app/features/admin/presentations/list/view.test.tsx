import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PresentationsListView } from "@/features/admin/presentations/list/view";

import type { PresentationListItem, PresentationListResult } from "./server";

describe("PresentationsListView", () => {
  test("shows the event-required empty state when there is no active event", () => {
    const markup = renderView({ selectedEventId: null });

    expect(markup).toContain(
      "Elegí un evento activo para ordenar la presentación",
    );
  });

  test("shows the empty state when the event has nothing to order", () => {
    const markup = renderView({ hasAnyRow: false, presentations: [] });

    expect(markup).toContain("Todavía no hay coreografías para ordenar.");
  });

  test("invites the administrator to order when nothing is numbered yet", () => {
    const markup = renderView({
      hasPresentations: false,
      presentations: [buildItem({ orderNumber: null })],
      unorderedCount: 1,
    });

    expect(markup).toContain(
      "Las coreografías todavía no tienen un número de presentación asignado.",
    );
    expect(markup).toContain("Ordenar automáticamente");
  });

  test("counts the late rows and the warned ones in singular and plural", () => {
    const singular = renderView({
      presentations: [buildItem({ orderNumber: 1 })],
      unorderedCount: 1,
      warnedCount: 1,
    });

    expect(singular).toContain(
      "Existe 1 coreografía sin número de presentación.",
    );
    expect(singular).toContain("Existe 1 presentación con advertencias.");

    const plural = renderView({
      presentations: [buildItem({ orderNumber: 1 })],
      unorderedCount: 3,
      warnedCount: 2,
    });

    expect(plural).toContain(
      "Existen 3 coreografías sin número de presentación.",
    );
    expect(plural).toContain("Existen 2 presentaciones con advertencias.");
  });

  test("badges an unnumbered row and triages a numbered one by its warnings", () => {
    const markup = renderView({
      presentations: [
        buildItem({ id: "late", orderNumber: null }),
        buildItem({
          id: "flagged",
          orderNumber: 1,
          warnings: [
            { kind: "outOfBlock", message: "Fuera de su bloque" },
            { kind: "belowDeposit", message: "Seña pendiente" },
          ],
        }),
      ],
      unorderedCount: 1,
      warnedCount: 1,
    });

    expect(markup).toContain("Sin número");
    expect(markup).toContain("Seña pendiente");
    expect(markup).not.toContain(">Fuera de bloque<");
  });

  test("lets a numbered row be chosen and leaves an unnumbered one out", () => {
    const markup = renderView({
      presentations: [
        buildItem({ id: "choreography-1", orderNumber: 1 }),
        buildItem({ id: "choreography-2", orderNumber: null }),
      ],
      unorderedCount: 1,
    });
    const checkboxes = [
      ...markup.matchAll(/<button[^>]*aria-label="Seleccionar fila"[^>]*>/g),
    ].map((match) => match[0]);

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toContain('disabled=""');
    expect(checkboxes[1]).toContain('disabled=""');
  });

  test("keeps the selection column out of an auditor's list", () => {
    const markup = renderView({ canOrder: false });

    expect(markup).not.toContain('aria-label="Seleccionar fila"');
  });

  test("replaces the warning badge with the evaluation once the panel judged the row", () => {
    const markup = renderView({
      presentations: [
        buildItem({
          evaluationStatus: "evaluated",
          warnings: [{ kind: "belowDeposit", message: "Seña pendiente" }],
        }),
      ],
    });

    expect(markup).toContain("Evaluada");
    expect(markup).not.toContain("Seña pendiente");
  });

  test("shows a disqualified row as disqualified", () => {
    const markup = renderView({
      presentations: [buildItem({ evaluationStatus: "disqualified" })],
    });

    expect(markup).toContain("Descalificada");
  });

  test("keeps the warning badge of a row the panel has not judged", () => {
    const markup = renderView({
      presentations: [
        buildItem({
          warnings: [{ kind: "belowDeposit", message: "Seña pendiente" }],
        }),
      ],
    });

    expect(markup).toContain("Seña pendiente");
    expect(markup).not.toContain("Evaluada");
  });

  test("shows the level of a row, and an em dash when it has none", () => {
    expect(
      renderView({
        presentations: [buildItem({ experienceLevel: "pre_elite" })],
      }),
    ).toContain("Pre Elite");
    expect(
      renderView({ presentations: [buildItem({ experienceLevel: null })] }),
    ).toContain("—");
  });

  test("leads a judged row's name to its scores and the rest to the choreography", () => {
    expect(
      renderView({
        presentations: [
          buildItem({
            evaluationStatus: "evaluated",
            presentationId: "presentation-9",
          }),
        ],
      }),
    ).toContain('href="/administracion/presentacion/presentation-9/puntajes"');
    expect(renderView()).toContain(
      'href="/administracion/coreografias/choreography-1"',
    );
  });

  test("keeps the actions menu out of an auditor's header", () => {
    const markup = renderView({ canOrder: false });

    expect(markup).not.toContain("Ordenar automáticamente");
  });
});

function buildItem(
  overrides: Partial<PresentationListItem> = {},
): PresentationListItem {
  return {
    academyName: "Academia Sur",
    assignedJudgeIds: [],
    categoryName: "Infantil",
    choreographyNumber: 12,
    evaluationStatus: "pending",
    experienceLevel: null,
    financialStatus: "depositMet",
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    presentationId: "presentation-1",
    scheduledDate: "2026-05-01",
    submodalityName: null,
    warnings: [],
    ...overrides,
  };
}

function renderView(overrides: Partial<PresentationListResult> = {}) {
  const loaderData: PresentationListResult = {
    assignableJudges: [],
    assignedJudges: [],
    canOrder: true,
    days: ["2026-05-01"],
    filters: {
      day: null,
      order: { columnId: "orden", direction: "asc" },
      page: 1,
      query: "",
      warnings: null,
    },
    hasAnyRow: true,
    hasPresentations: true,
    presentations: [buildItem()],
    presentationCount: 1,
    selectedEventId: "event-1",
    totalCount: 1,
    totalPages: 1,
    unorderedCount: 0,
    warnedCount: 0,
    ...overrides,
  };

  // The list moves a presentation through a fetcher, which needs a data
  // router: `MemoryRouter` is not one.
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/presentacion",
        action: async () => null,
        element: <PresentationsListView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/administracion/presentacion"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

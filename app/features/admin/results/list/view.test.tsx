/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { ResultsListItem, ResultsListResult } from "./shared";
import { ResultsListView } from "./view";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
  useNavigationMock.mockReset();
});

function buildRow(overrides: Partial<ResultsListItem> = {}): ResultsListItem {
  return {
    academyName: "Academia Pirueta",
    average: null,
    award: null,
    categoryName: "Juvenil",
    choreographyNumber: 12,
    evaluationStatus: "pending",
    experienceLevel: null,
    groupType: "solo",
    id: "coreografia_1",
    modalityName: "Jazz",
    name: "Brisa",
    orderNumber: 7,
    presentationId: "presentacion_1",
    published: false,
    scheduledDate: "2026-11-20",
    submodalityName: null,
    ...overrides,
  };
}

function buildLoaderData(
  overrides: Partial<ResultsListResult> = {},
): ResultsListResult {
  return {
    canPublish: true,
    days: ["2026-11-20"],
    filters: {
      day: null,
      order: { columnId: "orden", direction: "asc" },
      page: 1,
      query: "",
    },
    hasAnyRow: true,
    exportDays: [],
    publication: { pendingCount: 0, publishedAt: null, publishedCount: 0 },
    results: [buildRow()],
    selectedEventId: "evento_1",
    totalCount: 1,
    totalPages: 1,
    ...overrides,
  };
}

async function renderList(loaderData: ResultsListResult) {
  useNavigationMock.mockReturnValue({ state: "idle" });

  const router = createMemoryRouter(
    [
      {
        path: "/administracion/resultados",
        action: async () => null,
        element: <ResultsListView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/administracion/resultados"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function rowText(name: string) {
  const row = Array.from(document.querySelectorAll("tbody tr")).find((tr) =>
    tr.textContent?.includes(name),
  );

  if (!row) {
    throw new Error(`Expected a row for "${name}".`);
  }

  return Array.from(row.querySelectorAll("td")).map(
    (cell) => cell.textContent?.trim() ?? "",
  );
}

describe("ResultsListView rows", () => {
  test("links an evaluated presentation to its scores", async () => {
    await renderList(
      buildLoaderData({
        results: [
          buildRow({
            average: 82.5,
            award: "silver",
            evaluationStatus: "evaluated",
            published: true,
          }),
        ],
      }),
    );

    expect(
      document.querySelector(
        'a[href="/administracion/presentaciones/presentacion_1/puntajes"]',
      )?.textContent,
    ).toBe("Brisa");
    expect(document.querySelector('[aria-label="Sin publicar"]')).toBeNull();
  });

  test("leaves a presentation the panel has not reached blank, with no link", async () => {
    await renderList(buildLoaderData());

    expect(rowText("Brisa").slice(-2)).toEqual(["—", "—"]);
    expect(document.querySelector("tbody a")).toBeNull();
  });

  test("marks an evaluated result the academies do not see yet", async () => {
    await renderList(
      buildLoaderData({
        results: [
          buildRow({
            average: 91,
            award: "gold",
            evaluationStatus: "evaluated",
          }),
        ],
      }),
    );

    expect(rowText("Brisa").at(-2)).toBe("Medalla de oro");
    expect(
      document.querySelector('[aria-label="Sin publicar"]'),
    ).not.toBeNull();
  });

  test("puts the disqualification in the award's place, with no average", async () => {
    await renderList(
      buildLoaderData({
        results: [
          buildRow({ evaluationStatus: "disqualified", published: true }),
        ],
      }),
    );

    expect(rowText("Brisa").slice(-2)).toEqual(["Descalificada", "—"]);
    expect(document.querySelector('[aria-label="Sin publicar"]')).toBeNull();
  });
});

describe("ResultsListView publication", () => {
  test("offers only `Mostrar resultados` while the results are hidden", async () => {
    await renderResults();
    await openActionsMenu();

    expect(getMenuLabels()).toContain("Mostrar resultados");
    expect(getMenuLabels()).not.toContain("Actualizar resultados");
    expect(getMenuLabels()).not.toContain("Ocultar resultados");
    expect(document.body.textContent).not.toContain("Resultados publicados");
  });

  test("swaps to `Actualizar resultados` and `Ocultar resultados` once published", async () => {
    await renderResults({
      pendingCount: 2,
      publishedAt: new Date("2026-03-14T23:30:00Z"),
      publishedCount: 3,
    });
    await openActionsMenu();

    expect(getMenuLabels()).toContain("Actualizar resultados");
    expect(getMenuLabels()).toContain("Ocultar resultados");
    expect(getMenuLabels()).not.toContain("Mostrar resultados");
  });

  test("gives an auditor the alert but no actions menu", async () => {
    await renderResults(
      {
        pendingCount: 0,
        publishedAt: new Date("2026-03-14T23:30:00Z"),
        publishedCount: 3,
      },
      { canPublish: false },
    );

    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();
    expect(document.body.textContent).toContain("Resultados publicados");
  });

  test("says what the academies see, and only names the pending ones when there are any", async () => {
    await renderResults({
      pendingCount: 0,
      publishedAt: new Date("2026-03-14T23:30:00Z"),
      publishedCount: 1,
    });

    expect(document.body.textContent).toContain(
      "Las academias ven los resultados de 1 presentación, publicados el 14/3 a las 20:30.",
    );
    expect(document.body.textContent).not.toContain("desde entonces");

    renderer.cleanup();

    await renderResults({
      pendingCount: 2,
      publishedAt: new Date("2026-03-14T23:30:00Z"),
      publishedCount: 3,
    });

    expect(document.body.textContent).toContain(
      "Las academias ven los resultados de 3 presentaciones, publicados el 14/3 a las 20:30.",
    );
    expect(document.body.textContent).toContain(
      'Hay 2 evaluadas desde entonces: usá "Actualizar resultados" para sumarlas.',
    );
  });

  test("confirms showing the results with what the academies are about to see", async () => {
    await renderResults({
      pendingCount: 4,
      publishedAt: null,
      publishedCount: 0,
    });
    await openActionsMenu();
    await clickMenuItem("Mostrar resultados");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("¿Mostrar resultados?");
    expect(dialog?.textContent).toContain(
      "Cada academia ve el premio, el promedio y las devoluciones de las 4 presentaciones evaluadas hasta ahora. Las que se evalúen después se suman cuando actualices.",
    );
    expect(
      dialog?.querySelector('input[name="intent"]')?.getAttribute("value"),
    ).toBe("publish-results");
  });

  test("agrees with a count of one, in the alert and in the confirmation", async () => {
    await renderResults({
      pendingCount: 1,
      publishedAt: new Date("2026-03-14T23:30:00Z"),
      publishedCount: 0,
    });

    expect(document.body.textContent).toContain(
      'Hay 1 evaluada desde entonces: usá "Actualizar resultados" para sumarlas.',
    );

    await openActionsMenu();
    await clickMenuItem("Actualizar resultados");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain(
      "Se publican la presentación evaluada hasta ahora, 1 más que la última vez.",
    );
  });

  test("confirms updating the results with how many more go out", async () => {
    await renderResults({
      pendingCount: 2,
      publishedAt: new Date("2026-03-14T23:30:00Z"),
      publishedCount: 3,
    });
    await openActionsMenu();
    await clickMenuItem("Actualizar resultados");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("¿Actualizar resultados?");
    expect(dialog?.textContent).toContain(
      "Se publican las 5 presentaciones evaluadas hasta ahora, 2 más que la última vez.",
    );
    expect(
      dialog?.querySelector('input[name="intent"]')?.getAttribute("value"),
    ).toBe("publish-results");
  });

  test("confirms hiding the results destructively", async () => {
    await renderResults({
      pendingCount: 0,
      publishedAt: new Date("2026-03-14T23:30:00Z"),
      publishedCount: 3,
    });
    await openActionsMenu();
    await clickMenuItem("Ocultar resultados");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("¿Ocultar resultados?");
    expect(dialog?.textContent).toContain(
      "Las academias dejan de ver todos los resultados. Para volver a mostrarlos se publica de nuevo lo evaluado en ese momento.",
    );
    expect(
      dialog?.querySelector('input[name="intent"]')?.getAttribute("value"),
    ).toBe("hide-results");
    expect(
      dialog?.querySelector('button[data-variant="destructive"]'),
    ).not.toBeNull();
  });

  function getMenuLabels() {
    return Array.from(document.querySelectorAll('[role="menuitem"]')).map(
      (item) => item.textContent?.trim(),
    );
  }

  async function renderResults(
    publication: ResultsListResult["publication"] = {
      pendingCount: 0,
      publishedAt: null,
      publishedCount: 0,
    },
    overrides: Partial<ResultsListResult> = {},
  ) {
    await renderList({ ...buildLoaderData(), publication, ...overrides });
  }
});

async function openActionsMenu() {
  const button = document.querySelector('button[aria-label="Acciones"]');

  if (!button) {
    throw new Error("Expected the list's actions button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

async function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!item) {
    throw new Error(`Expected menu item "${label}" to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

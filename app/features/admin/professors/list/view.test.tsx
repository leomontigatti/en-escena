/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import type { loadProfessorsList } from "./server";
import { ProfessorsListRouteView } from "./view";

type LoaderData = Awaited<ReturnType<typeof loadProfessorsList>>;

describe("ProfessorsListRouteView", () => {
  // The administrator ticks the professors to print accreditations for. The
  // print item itself sits in the closed `Acciones` menu, which static markup
  // does not render.
  test("offers the administrator a checkbox per row and the actions menu", () => {
    const page = render(loaderDataFixture());

    expect(
      page.querySelector('[aria-label="Seleccionar todas las filas"]'),
    ).not.toBeNull();
    expect(page.textContent).toContain("Acciones");
  });

  test("does not let an archived professor be ticked", () => {
    const page = render(loaderDataFixture());
    const rowCheckboxes = [
      ...page.querySelectorAll('[aria-label="Seleccionar fila"]'),
    ];

    expect(rowCheckboxes.map((box) => box.hasAttribute("disabled"))).toEqual([
      false,
      true,
    ]);
  });

  // The auditor reads the list and exports it, and prints nothing: their
  // `Acciones` menu is the export one.
  test("offers the auditor no checkboxes", () => {
    const page = render(loaderDataFixture({ canWrite: false }));

    expect(page.querySelector('[aria-label="Seleccionar fila"]')).toBeNull();
    expect(
      page.querySelector('[aria-label="Seleccionar todas las filas"]'),
    ).toBeNull();
  });
});

function render(loaderData: LoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <ProfessorsListRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/"] },
  );
  const container = document.createElement("div");

  container.innerHTML = renderToStaticMarkup(
    <RouterProvider router={router} />,
  );

  return container;
}

function loaderDataFixture(overrides: Partial<LoaderData> = {}): LoaderData {
  return {
    canWrite: true,
    selectedEventId: "event_1",
    filters: {
      order: { columnId: "nombre", direction: "asc" },
      participation: "all",
      query: "",
      status: "active",
      page: 1,
    },
    hasAnyProfessor: true,
    professors: [
      {
        id: "professor_1",
        firstName: "Luz",
        lastName: "Suárez",
        active: true,
        academyName: "Academia Demo",
        participationStatus: "participating",
        identificationStatus: "complete",
      },
      {
        id: "professor_2",
        firstName: "Nora",
        lastName: "Díaz",
        active: false,
        academyName: "Academia Demo",
        participationStatus: "not-participating",
        identificationStatus: "complete",
      },
    ],
    totalCount: 2,
    totalPages: 1,
    ...overrides,
  };
}

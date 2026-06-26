import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";

type ProfessorsListViewProps = Parameters<
  typeof PortalProfessorsListRouteView
>[0];

describe("PortalProfessorsListRouteView", () => {
  test("shows the empty list surface", () => {
    const markup = renderProfessorsList();

    expect(markup).toContain("Profesores");
    expect(markup).toContain("Todavía no cargaste profesores");
    expect(markup).toContain(
      "Sumá el plantel docente de tu academia para empezar a vincularlo en las coreografías.",
    );
  });

  test("keeps the screen stable when create returns field errors", () => {
    const markup = renderProfessorsList({
      actionData: {
        status: "error",
        fieldErrors: {
          firstName: "Este campo es obligatorio.",
          lastName: "Este campo es obligatorio.",
        },
        values: {
          firstName: "",
          lastName: "  de la CRUZ ",
        },
        modalOpen: true,
      },
    });

    expect(markup).toContain("Profesores");
    expect(markup).toContain("Nuevo profesor");
    expect(markup).not.toContain("Profesor creado.");
  });

  test("renders the table with filters and action", () => {
    const markup = renderProfessorsList({
      loaderData: {
        professors: [
          professorListItem({
            id: "prof_complete",
            firstName: "Ana",
            lastName: "Completa",
            documentType: "dni",
            documentNumber: "12345678",
            isIncomplete: false,
          }),
          professorListItem({
            id: "prof_archived",
            firstName: "José Luis",
            lastName: "de la Cruz",
            active: false,
          }),
        ],
      },
    });

    expect(markup).toContain("Profesores");
    expect(markup).toContain(
      "Buscar profesor por nombre o número de documento",
    );
    expect(markup).toContain("Nuevo profesor");
    expect(markup).toContain("Filtro");
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Completo");
    expect(markup).toContain('href="/portal/profesores/prof_complete"');
    expect(markup).not.toContain('href="/portal/profesores/prof_archived"');
    expect(markup).not.toContain("Archivar Profesor");
    expect(markup).not.toContain("Reactivar Profesor");
  });
});

function renderProfessorsList(input: Partial<ProfessorsListViewProps> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/profesores",
        action: async () => null,
        element: (
          <PortalProfessorsListRouteView
            loaderData={input.loaderData ?? { professors: [] }}
            actionData={input.actionData}
          />
        ),
      },
    ],
    { initialEntries: ["/portal/profesores"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function professorListItem(
  overrides: Partial<
    ProfessorsListViewProps["loaderData"]["professors"][number]
  > = {},
) {
  return {
    id: "profesor_1",
    firstName: "Ana",
    lastName: "Zapata",
    active: true,
    documentType: null,
    documentNumber: null,
    isIncomplete: true,
    participationStatus: "not-participating" as const,
    ...overrides,
  } satisfies ProfessorsListViewProps["loaderData"]["professors"][number];
}

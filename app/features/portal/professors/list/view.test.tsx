import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";
import { eventDocumentDownloadUrls } from "@/lib/events/event-documents.test-support";

type ProfessorsListViewProps = Parameters<
  typeof PortalProfessorsListRouteView
>[0];

type ProfessorsListViewInput = {
  actionData?: ProfessorsListViewProps["actionData"];
  loaderData?: Partial<ProfessorsListViewProps["loaderData"]>;
};

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

  test("hides the participation badge when there is no active event", () => {
    const markup = renderProfessorsList({
      loaderData: {
        professors: [
          professorListItem({
            id: "prof_sin_evento",
            participationStatus: "no-event",
          }),
        ],
      },
    });

    expect(markup).not.toContain("No participando");
    expect(markup).not.toContain(">Participando<");
    expect(markup).not.toContain("Sin evento");
  });
});

describe("PortalProfessorsListRouteView event documents", () => {
  test("offers the professors contract beside the primary action", () => {
    const markup = renderProfessorsList({
      loaderData: {
        documentDownloadUrls: eventDocumentDownloadUrls({
          professor_contract: "/almacenamiento?key=contrato",
        }),
      },
    });

    expect(markup).toContain("Nuevo profesor");
    expect(markup).toContain('aria-label="Documentos del evento"');
  });

  test("keeps the menu when the event has no document", () => {
    const markup = renderProfessorsList();

    expect(markup).toContain('aria-label="Documentos del evento"');
  });
});

function renderProfessorsList(input: ProfessorsListViewInput = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/profesores",
        action: async () => null,
        element: (
          <PortalProfessorsListRouteView
            loaderData={{
              documentDownloadUrls: eventDocumentDownloadUrls(),
              professors: [],
              ...input.loaderData,
            }}
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

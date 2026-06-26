import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalProfessorDetailRouteView } from "@/features/portal/professors/detail/view";

type ProfessorDetailViewProps = Parameters<
  typeof PortalProfessorDetailRouteView
>[0];

describe("PortalProfessorDetailRouteView", () => {
  test("renders the editable ficha", () => {
    const markup = renderProfessorDetail({
      loaderData: {
        professor: professorListItem({
          id: "profesor_1",
          firstName: "Ana",
          lastName: "Perez",
          active: false,
          isIncomplete: true,
        }),
      },
    });

    expect(markup).toContain(">Ana Perez</h1>");
    expect(markup).not.toContain("Editar Profesor");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="lastName" value="Perez"');
    expect(markup).toContain("Acciones");
    expect(markup).toContain("Este profesor está archivado");
    expect(markup).toContain("Reactivar");
    expect(markup).toContain("Faltan datos de identificación.");
    expect(markup).not.toContain("validar la identificación");
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Apellido");
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain('name="documentType" value=""');
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
    expect(markup).toContain('form="portal-profesor-form"');
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).not.toContain("Archivado");
    expect(markup).not.toContain("Activo");
  });

  test("shows field errors and preserves submitted values", () => {
    const markup = renderProfessorDetail({
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentType: "Seleccioná el tipo de documento.",
          documentNumber: "Ingresá el número de documento.",
        },
        values: {
          firstName: "Ana",
          lastName: "Perez",
          documentType: "",
          documentNumber: "1234",
        },
      },
    });

    expect(markup).toContain("Seleccioná el tipo de documento.");
    expect(markup).toContain("Ingresá el número de documento.");
    expect(markup).toContain('name="documentNumber" value="1234"');
    expect(markup).toContain('name="documentType" value=""');
  });

  test("shows saved target state without incomplete alerts", () => {
    const markup = renderProfessorDetail({
      loaderData: {
        professor: professorListItem({
          documentType: "dni",
          documentNumber: "12345678",
          isIncomplete: false,
        }),
      },
    });

    expect(markup).toContain(">Ana Zapata</h1>");
    expect(markup).not.toContain("Faltan datos de identificación.");
  });

  test("shows archived alerts and reactivate action", () => {
    const markup = renderProfessorDetail({
      loaderData: {
        professor: professorListItem({
          active: false,
          isIncomplete: false,
        }),
      },
    });

    expect(markup).toContain("Este profesor está archivado");
    expect(markup).toContain("Reactivar");
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).toContain("Volver");
    expect(markup).not.toContain("Archivar Profesor");
  });

  test("shows the reactivation confirmation", () => {
    const markup = renderProfessorDetail({
      loaderData: {
        professor: professorListItem({
          active: false,
        }),
      },
      initialStatusDialogIntent: "reactivate-professor",
    });

    expect(markup).toContain("Acciones");
    expect(markup).toContain("¿Reactivar profesor?");
    expect(markup).toContain(
      "El profesor volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    );
  });
});

function renderProfessorDetail(input: Partial<ProfessorDetailViewProps> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/profesores/:professorId",
        action: async () => null,
        element: (
          <PortalProfessorDetailRouteView
            loaderData={input.loaderData ?? { professor: professorListItem() }}
            actionData={input.actionData}
            initialStatusDialogIntent={input.initialStatusDialogIntent}
          />
        ),
      },
    ],
    { initialEntries: ["/portal/profesores/profesor_1"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function professorListItem(
  overrides: Partial<ProfessorDetailViewProps["loaderData"]["professor"]> = {},
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
  } satisfies ProfessorDetailViewProps["loaderData"]["professor"];
}

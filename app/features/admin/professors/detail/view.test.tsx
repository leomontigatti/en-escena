import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionProfesorDetalleRouteView } from "@/features/admin/professors/detail/view";

type ProfessorDetailViewProps = Parameters<
  typeof AdministracionProfesorDetalleRouteView
>[0];

describe("AdministracionProfesorDetalleRouteView", () => {
  test("renders the readonly ficha for auditors", () => {
    const markup = renderProfessorDetail();

    expect(markup).toContain("Detalle profesor");
    expect(markup).toContain(
      "Revisá la información administrativa de este profesor.",
    );
    expect(markup).toContain("Academia Ficha");
    expect(markup).toContain("Julia");
    expect(markup).toContain("Detalle");
    expect(markup).toContain("Pasaporte");
    expect(markup).toContain("AA123456");
    expect(markup).toContain("Volver");
    expect(markup).toContain('href="/administracion/profesores?pagina=2"');
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Guardar");
    expect(markup).not.toContain("Acciones");
  });

  test("shows edit controls and alerts for admin users", () => {
    const markup = renderProfessorDetail({
      loaderData: {
        backToList: "/administracion/profesores",
        cancelHref: "/administracion/profesores/profesor_1",
        canEdit: true,
        editHref: "/administracion/profesores/profesor_1?modo=editar",
        isEditing: false,
        professor: professorDetail({
          active: false,
          correctionReasonRequired: true,
          documentNumber: null,
          documentType: null,
          isIncomplete: true,
        }),
        selectedEventId: "evento_1",
      },
    });

    expect(markup).toContain("Acciones");
    expect(markup).toContain("Editar");
    expect(markup).toContain("Este profesor está archivado.");
    expect(markup).toContain("Reactivar");
    expect(markup).toContain("Faltan datos de identificación.");
  });

  test("keeps edit mode and submitted values after an action error", () => {
    const markup = renderProfessorDetail({
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          correctionReason:
            "Ingresá un motivo de corrección para guardar este cambio.",
        },
        values: {
          correctionReason: "",
          documentNumber: "",
          documentType: "",
          firstName: "Mora",
          lastName: "Dialogo",
        },
      },
      loaderData: {
        backToList: "/administracion/profesores?pagina=2",
        cancelHref: "/administracion/profesores/profesor_1",
        canEdit: true,
        editHref: "/administracion/profesores/profesor_1?modo=editar",
        isEditing: true,
        professor: professorDetail({
          correctionReasonRequired: true,
          firstName: "Julia",
          lastName: "Detalle",
        }),
        selectedEventId: "evento_1",
      },
    });

    expect(markup).toContain("Guardar");
    expect(markup).toContain("Cancelar");
    expect(markup).toContain('name="firstName" value="Mora"');
    expect(markup).toContain('name="lastName" value="Dialogo"');
  });
});

function renderProfessorDetail(input: Partial<ProfessorDetailViewProps> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/profesores/:professorId",
        action: async () => null,
        element: (
          <AdministracionProfesorDetalleRouteView
            loaderData={
              input.loaderData ?? {
                backToList: "/administracion/profesores?pagina=2",
                cancelHref: "/administracion/profesores/profesor_1",
                canEdit: false,
                editHref: "/administracion/profesores/profesor_1?modo=editar",
                isEditing: false,
                professor: professorDetail(),
                selectedEventId: "evento_1",
              }
            }
            actionData={input.actionData}
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/profesores/profesor_1"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function professorDetail(
  overrides: Partial<
    NonNullable<ProfessorDetailViewProps["loaderData"]["professor"]>
  > = {},
) {
  return {
    academy: {
      contactName: "Elena Ficha",
      email: "ficha.academia@example.com",
      id: "academia_1",
      name: "Academia Ficha",
      phone: "4444-4444",
    },
    active: true,
    choreographyNames: ["Raíz"],
    correctionReasonRequired: false,
    createdAt: new Date("2026-01-10T12:00:00Z"),
    documentNumber: "AA123456",
    documentType: "passport" as const,
    firstName: "Julia",
    id: "profesor_1",
    isIncomplete: false,
    lastName: "Detalle",
    participatedInAnyEvent: true,
    participationStatus: "participating" as const,
    updatedAt: new Date("2026-06-05T15:30:00Z"),
    ...overrides,
  };
}

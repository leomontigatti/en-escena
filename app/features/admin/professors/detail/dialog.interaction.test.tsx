// @vitest-environment jsdom

import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { AdministracionProfesorDetalleRouteView } from "./view";

type ProfessorDetailViewProps = Parameters<
  typeof AdministracionProfesorDetalleRouteView
>[0];
type ProfessorEditConsequence =
  ProfessorDetailViewProps["loaderData"]["professor"]["editConsequence"];

describe("AdministracionProfesorDetalleRouteView dialogs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("editing a non-consequential Profesor saves without a confirmation dialog", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/profesores/profesor_1"]}>
        <AdministracionProfesorDetalleRouteView
          loaderData={createLoaderData({
            editConsequence: null,
            isEditing: true,
          })}
        />
      </MemoryRouter>,
    );

    const saveButton = getButton("Guardar");

    expect(saveButton.getAttribute("type")).toBe("submit");
    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
  });

  test("editing a participating Profesor confirms with the participation message and no reason field", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/profesores/profesor_1"]}>
        <AdministracionProfesorDetalleRouteView
          loaderData={createLoaderData({
            editConsequence: "participated",
            isEditing: true,
          })}
        />
      </MemoryRouter>,
    );

    expect(document.body.textContent).not.toContain("¿Guardar cambios?");

    await clickReactDomButton("Guardar", { exact: true });

    expect(document.body.textContent).toContain("¿Guardar cambios?");
    expect(document.body.textContent).toContain("ya participó de un evento");
    expect(document.body.textContent).not.toContain("Motivo de corrección");
  });
});

function createLoaderData({
  editConsequence = null,
  isEditing = false,
}: {
  editConsequence?: ProfessorEditConsequence;
  isEditing?: boolean;
} = {}): ProfessorDetailViewProps["loaderData"] {
  return {
    backToList: "/administracion/profesores",
    cancelHref: "/administracion/profesores/profesor_1",
    canEdit: true,
    editHref: "/administracion/profesores/profesor_1?modo=editar",
    isEditing,
    professor: {
      academy: {
        contactName: "Contacto Test",
        email: "academia@example.com",
        id: "academy-1",
        name: "Academia Test",
        phone: "1234-5678",
      },
      active: true,
      choreographyNames: [],
      createdAt: new Date("2026-01-10T12:00:00.000Z"),
      documentNumber: "12345678",
      documentType: "dni",
      editConsequence,
      firstName: "Julia",
      id: "profesor_1",
      isIncomplete: false,
      lastName: "Detalle",
      participatedInAnyEvent: editConsequence === "participated",
      participationStatus: "not-participating",
      updatedAt: new Date("2026-01-10T12:00:00.000Z"),
    },
    selectedEventId: null,
  };
}

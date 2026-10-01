// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  getButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { ProfessorDetailRouteView } from "./view";

type ProfessorDetailViewProps = Parameters<typeof ProfessorDetailRouteView>[0];
type ProfessorEditConsequence =
  ProfessorDetailViewProps["loaderData"]["professor"]["editConsequence"];

describe("ProfessorDetailRouteView dialogs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("editing a non-consequential professor saves without a confirmation dialog", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/profesores/profesor_1",
        <ProfessorDetailRouteView
          loaderData={createLoaderData({
            editConsequence: null,
          })}
        />,
      ),
    );

    expect(getButton("Guardar").hasAttribute("disabled")).toBe(true);

    await changeFirstName("Julieta");

    const saveButton = getButton("Guardar");

    expect(saveButton.getAttribute("type")).toBe("submit");
    expect(saveButton.hasAttribute("disabled")).toBe(false);
    expect(document.body.textContent).not.toContain("¿Guardar los cambios?");
  });

  test("editing a participating professor confirms with the participation message and no reason field", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/profesores/profesor_1",
        <ProfessorDetailRouteView
          loaderData={createLoaderData({
            editConsequence: "participated",
          })}
        />,
      ),
    );

    expect(document.body.textContent).not.toContain("¿Guardar los cambios?");

    await changeFirstName("Julieta");
    await clickReactDomButton("Guardar", { exact: true });

    expect(document.body.textContent).toContain("¿Guardar los cambios?");
    expect(document.body.textContent).toContain("ya participó de un evento");
    expect(document.body.textContent).not.toContain("Motivo de corrección");
  });

  test("offers `Descartar cambios` only while there are changes, and it restores the saved values", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/profesores/profesor_1",
        <ProfessorDetailRouteView loaderData={createLoaderData()} />,
      ),
    );

    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(findButton("Editar")).toBeUndefined();
    expect(findButton("Cancelar")).toBeUndefined();

    await changeFirstName("Julieta");

    expect(findButton("Descartar cambios")).toBeDefined();

    await clickReactDomButton("Descartar cambios");

    expect(readFirstName().value).toBe("Julia");
    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(getButton("Guardar").hasAttribute("disabled")).toBe(true);
  });

  test("keeps Guardar on after a refused save that refilled the form", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/profesores/profesor_1",
        <ProfessorDetailRouteView
          loaderData={createLoaderData()}
          actionData={{
            status: "error",
            message: "Revisá los datos del Profesor.",
            fieldErrors: { documentNumber: "Ya existe." },
            values: {
              firstName: "Julieta",
              lastName: "Detalle",
              documentType: "dni",
              documentNumber: "12345678",
            },
          }}
        />,
      ),
    );

    expect(readFirstName().value).toBe("Julieta");
    expect(getButton("Guardar").hasAttribute("disabled")).toBe(false);
    expect(findButton("Descartar cambios")).toBeDefined();
  });

  test("shows an auditor the fields disabled and only Volver", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/profesores/profesor_1",
        <ProfessorDetailRouteView
          loaderData={createLoaderData({ canEdit: false })}
        />,
      ),
    );

    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("input:not([type=hidden])"),
    );

    expect(inputs.some((input) => input.value === "Julia")).toBe(true);
    expect(inputs.every((input) => input.disabled)).toBe(true);
    expect(document.body.textContent).toContain("Volver");
    expect(findButton("Guardar")).toBeUndefined();
    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(findButton("Editar")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Cancelar");
  });

  test("lands the duplicate-document refusal on the field and links to the match", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/profesores/profesor_1",
        <ProfessorDetailRouteView
          loaderData={createLoaderData()}
          actionData={{
            status: "error",
            message: "Revisá los datos del Profesor.",
            fieldErrors: {
              documentNumber:
                "Ya existe un profesor archivado con ese documento en la academia.",
            },
            values: {
              firstName: "Ana",
              lastName: "Perez",
              documentType: "dni",
              documentNumber: "30111222",
            },
            duplicateDocumentProfessorId: "profesor_archivado_1",
          }}
        />,
      ),
    );

    const documentField = document.querySelector<HTMLInputElement>(
      'input[name="documentNumber"]',
    );

    expect(documentField?.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain(
      "Ya existe un profesor archivado con ese documento en la academia.",
    );
    expect(
      document.querySelector(
        'a[href="/administracion/profesores/profesor_archivado_1"]',
      )?.textContent,
    ).toBe("Ver la ficha del profesor con ese documento");
  });
});

function readFirstName() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="firstName"]',
  );

  if (!input) {
    throw new Error("Expected the first name field to be rendered.");
  }

  return input;
}

async function changeFirstName(value: string) {
  const input = readFirstName();

  await updateReactDomForm(() => setInputValue(input, value));
}

function createLoaderData({
  canEdit = true,
  editConsequence = null,
}: {
  canEdit?: boolean;
  editConsequence?: ProfessorEditConsequence;
} = {}): ProfessorDetailViewProps["loaderData"] {
  return {
    backToList: "/administracion/profesores",
    canEdit,
    isParticipatingInActiveEvent: false,
    merge: null,
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

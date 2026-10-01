// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  getButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

type DancerEditConsequence =
  DancerDetailRouteViewProps["loaderData"]["dancer"]["editConsequence"];

type DancerDetailRouteViewComponent =
  typeof import("@/routes/administracion.bailarines_.$dancerId").DancerDetailRouteView;
type DancerDetailRouteViewProps = Parameters<DancerDetailRouteViewComponent>[0];

describe("DancerDetailRouteView dialogs", () => {
  const renderer = createReactDomTestRenderer();
  let DancerDetailRouteView: DancerDetailRouteViewComponent;

  beforeAll(async () => {
    ({ DancerDetailRouteView } =
      await import("@/routes/administracion.bailarines_.$dancerId"));
  }, 30_000);

  afterEach(renderer.cleanup);

  test("unmounts closed confirmation dialogs so another dialog can be closed normally", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView loaderData={createLoaderData()} />,
      ),
    );

    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    expect(document.body.textContent).not.toContain("¿Archivar bailarín?");
    expect(document.body.textContent).not.toContain("¿Verificar?");

    await clickReactDomButton("Verificar", { exact: true });

    expect(document.body.textContent).toContain("¿Verificar?");
    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    expect(document.body.textContent).not.toContain("¿Archivar bailarín?");

    await clickReactDomButton("Cancelar", { exact: true });

    expect(document.body.textContent).not.toContain("¿Verificar?");
    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    expect(document.body.textContent).not.toContain("¿Archivar bailarín?");
  });

  // Every field is in `Identificación`, and Radix unmounts it behind the other
  // tab: a save from `Inscripciones` would post an empty dancer (#1274).
  test("offers `Guardar` on the tab that holds the fields, and keeps what was typed behind the other", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView loaderData={createLoaderData()} />,
      ),
    );

    await updateReactDomForm(() => {
      setInputValue(getFirstNameInput(), "Bea");
    });
    await selectTab("Inscripciones");

    expect(document.querySelector('input[name="firstName"]')).toBeNull();
    expect(findButton("Guardar", { exact: true })).toBeUndefined();
    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(document.body.textContent).toContain("Volver");

    await selectTab("Identificación");

    expect(getFirstNameInput().value).toBe("Bea");
    expect(getButton("Guardar").disabled).toBe(false);

    const form = getFirstNameInput().form;

    if (!form) {
      throw new Error("The first name field is not inside a form.");
    }

    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      birthDate: "2012-07-12",
      documentBackImageStorageKey: "document-back",
      documentFrontImageStorageKey: "document-front",
      documentNumber: "12345678",
      documentType: "dni",
      firstName: "Bea",
      lastName: "Detalle",
    });
  });

  test("changing a dancer's status confirms without a correction reason field", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView
          loaderData={createLoaderData({
            active: false,
            editConsequence: "participated",
          })}
        />,
      ),
    );

    expect(document.body.textContent).not.toContain("¿Reactivar bailarín?");

    await clickReactDomButton("Reactivar", { exact: true });

    expect(document.body.textContent).toContain("¿Reactivar bailarín?");
    expect(document.body.textContent).not.toContain("Motivo de corrección");
  });

  test("editing a non-consequential dancer saves without a confirmation dialog", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView
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
    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
  });

  test("offers `Descartar cambios` only while there are changes, and it restores the saved values", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView loaderData={createLoaderData()} />,
      ),
    );

    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(findButton("Editar")).toBeUndefined();
    expect(findButton("Cancelar")).toBeUndefined();

    await changeFirstName("Julieta");

    expect(findButton("Descartar cambios")).toBeDefined();

    await clickReactDomButton("Descartar cambios");

    expect(
      document.querySelector<HTMLInputElement>('input[name="firstName"]')
        ?.value,
    ).toBe("Julia");
    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(getButton("Guardar").hasAttribute("disabled")).toBe(true);
  });

  test("shows an auditor the fields disabled and only Volver", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView
          loaderData={{ ...createLoaderData(), canEdit: false }}
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

  test("editing a verified dancer confirms with the verified message before saving", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView
          loaderData={createLoaderData({
            editConsequence: "verified",
          })}
        />,
      ),
    );

    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    await changeFirstName("Julieta");
    await clickReactDomButton("Guardar", { exact: true });

    expect(document.body.textContent).toContain("¿Guardar cambios?");
    expect(document.body.textContent).toContain("identidad verificada");
    expect(document.body.textContent).not.toContain("Motivo de corrección");
  });

  test("editing a participating dancer confirms with the participation message", async () => {
    await renderer.renderAsync(
      renderInDataRouter(
        "/administracion/bailarines/dancer-1",
        <DancerDetailRouteView
          loaderData={createLoaderData({
            editConsequence: "participated",
          })}
        />,
      ),
    );

    await changeFirstName("Julieta");
    await clickReactDomButton("Guardar", { exact: true });

    expect(document.body.textContent).toContain("¿Guardar cambios?");
    expect(document.body.textContent).toContain("ya participó de un evento");
    expect(document.body.textContent).not.toContain("Motivo de corrección");
  });
});

async function changeFirstName(value: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="firstName"]',
  );

  if (!input) {
    throw new Error("Expected the first name field to be rendered.");
  }

  await updateReactDomForm(() => setInputValue(input, value));
}

function createLoaderData({
  active = true,
  editConsequence = null,
}: {
  active?: boolean;
  editConsequence?: DancerEditConsequence;
} = {}): DancerDetailRouteViewProps["loaderData"] {
  return {
    activeEventStartDate: "2026-09-25",
    backToList: "/administracion/bailarines",
    canEdit: true,
    dancer: {
      academy: {
        contactName: "Contacto Test",
        email: "academia@example.com",
        id: "academy-1",
        name: "Academia Test",
        phone: "1234-5678",
      },
      active,
      birthDate: "2012-07-12",
      choreographyNames: [],
      editConsequence,
      createdAt: new Date("2026-01-10T12:00:00.000Z"),
      documentBackImageStorageKey: "document-back",
      documentFrontImageStorageKey: "document-front",
      documentNumber: "12345678",
      documentType: "dni",
      firstName: "Julia",
      id: "dancer-1",
      identificationStatus: "unverified",
      identityVerifiedAt: null,
      inscriptions: [],
      lastName: "Detalle",
      participatedInAnyEvent: false,
      participationStatus: "not-participating",
      updatedAt: new Date("2026-01-10T12:00:00.000Z"),
    },
    documentImageUrls: {
      back: null,
      front: null,
    },
    isParticipatingInActiveEvent: false,
    merge: null,
    selectedEventId: null,
  };
}

function getFirstNameInput() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="firstName"]',
  );

  if (!input) {
    throw new Error("The first name field is not in the DOM.");
  }

  return input;
}

async function selectTab(label: string) {
  const trigger = Array.from(document.querySelectorAll('[role="tab"]')).find(
    (candidate) => candidate.textContent === label,
  );

  // Radix activates a trigger on `mousedown`, not on the click after it.
  await act(async () => {
    trigger!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
}

/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

type DancerDetailProps = Parameters<typeof PortalDancerDetailRouteView>[0];

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

describe("the portal dancer detail as one draft", () => {
  test("holds `Guardar` until something changes, and `Descartar cambios` puts it back", async () => {
    await renderDancerPage();

    expect(isSaveEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();

    await typeFirstName("Bea");

    expect(isSaveEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(getFirstNameInput().value).toBe("Ana");
    expect(isSaveEnabled()).toBe(false);
  });

  test("asks before leaving with changes, and not when clean", async () => {
    const page = await renderDancerPage();

    await typeFirstName("Bea");
    await clickLink("Volver");

    expect(findDialog()).toBeDefined();
    expect(page.pathname()).toBe("/");

    await clickReactDomButton("Descartar", { exact: true });

    expect(page.pathname()).toBe("/portal/bailarines");
  });

  test("leaves without asking when nothing changed", async () => {
    const page = await renderDancerPage();

    await clickLink("Volver");

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/portal/bailarines");
  });

  test("keeps `Guardar` on after a refused save, refilled with what was typed", async () => {
    await renderDancerPage({
      actionData: {
        fieldErrors: { firstName: "No válido." },
        message: "Revisá los datos del Bailarín.",
        status: "error",
        values: {
          birthDate: "2014-01-01",
          documentBackImageStorageKey: "",
          documentFrontImageStorageKey: "",
          documentNumber: "",
          documentType: "",
          firstName: "Bea",
          lastName: "Paz",
        },
      },
    });

    expect(getFirstNameInput().value).toBe("Bea");
    expect(isSaveEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(getFirstNameInput().value).toBe("Ana");
    expect(isSaveEnabled()).toBe(false);
  });

  test("asks about the same-name warning in a dialog, leaves `Guardar` on after Cancelar, and still guards what was typed", async () => {
    await renderDancerPage({
      actionData: {
        status: "warning",
        values: {
          birthDate: "2014-01-01",
          documentBackImageStorageKey: "",
          documentFrontImageStorageKey: "",
          documentNumber: "",
          documentType: "",
          firstName: "Bea",
          lastName: "Paz",
        },
        warning: {
          kind: "dancer-name",
          matches: [{ id: "dancer_twin_1", label: "Bea Paz" }],
          scope: "portal",
        },
      },
    });

    expect(findDialog()?.textContent).toContain("¿Guardar el bailarín?");
    expect(dialogButtonLabels()).toEqual(["Cancelar", "Guardar"]);

    await clickReactDomButton("Cancelar");

    expect(findDialog()).toBeUndefined();
    expect(isSaveEnabled()).toBe(true);

    await clickLink("Volver");

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");
  });
});

async function renderDancerPage(
  input: { actionData?: DancerDetailProps["actionData"] } = {},
) {
  // The form posts to the URL the document says, which the memory router does
  // not set. The window is shared by every file of a `unit-shared` worker, so
  // its address is whatever the last one left: put it where this page sits.
  window.history.replaceState(null, "", "/");

  const router = createMemoryRouter(
    [
      {
        element: <Link to="/">Bailarín</Link>,
        path: "/portal/bailarines",
      },
      {
        action: () => null,
        element: (
          <PortalDancerDetailRouteView
            actionData={input.actionData}
            loaderData={buildLoaderData()}
          />
        ),
        path: "/",
      },
    ],
    { initialEntries: ["/"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
  await settle();

  return { pathname: () => router.state.location.pathname };
}

function buildLoaderData(): DancerDetailProps["loaderData"] {
  return {
    activeEventStartDate: "2026-09-25",
    dancer: {
      academyId: "academy_1",
      active: true,
      birthDate: "2014-01-01",
      createdAt: new Date("2026-01-01T12:00:00Z"),
      documentBackImageStorageKey: null,
      documentFrontImageStorageKey: null,
      documentNumber: null,
      documentType: null,
      firstName: "Ana",
      id: "dancer_1",
      identityVerifiedAt: null,
      lastName: "Paz",
      updatedAt: new Date("2026-01-02T12:00:00Z"),
    },
    documentImageUrls: { back: null, front: null },
    inscriptions: [],
    isParticipatingInActiveEvent: false,
    selectedEventId: "event_1",
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
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

async function typeFirstName(value: string) {
  await updateReactDomForm(() => {
    setInputValue(getFirstNameInput(), value);
  });
  await settle();
}

function isSaveEnabled() {
  const button = findButton("Guardar", { exact: true });

  return button !== undefined && !(button as HTMLButtonElement).disabled;
}

function findDialog() {
  return (
    document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined
  );
}

function dialogButtonLabels() {
  return Array.from(findDialog()?.querySelectorAll("button") ?? []).map(
    (button) => button.textContent?.trim(),
  );
}

async function clickLink(text: string) {
  const link = Array.from(document.querySelectorAll("a")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  if (!link) {
    throw new Error(`Expected a "${text}" link.`);
  }

  await act(async () => {
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }),
    );
    await Promise.resolve();
  });
  await settle();
}

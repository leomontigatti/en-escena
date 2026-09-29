/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { AcademyDetailRouteView } from "@/features/admin/academies/detail/view";
import type {
  AcademyDetailActionData,
  AcademyDetailLoaderData,
} from "@/features/admin/academies/detail/shared";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

const academyPath = "/administracion/academias/academy_1";

function buildLoaderData(canEdit: boolean): AcademyDetailLoaderData {
  return {
    academy: {
      contactName: "Nora Norte",
      email: "academia@example.com",
      id: "academy_1",
      name: "Academia Fork",
      phone: "3415551234",
    },
    canEdit,
    merge: null,
    selectedEventId: null,
  };
}

async function renderDetail({
  actionData,
  canEdit = true,
  initialDeleteDialogOpen = false,
}: {
  actionData?: AcademyDetailActionData;
  canEdit?: boolean;
  initialDeleteDialogOpen?: boolean;
} = {}) {
  let saves = 0;

  // The form posts to the URL the document says, which the memory router does
  // not set.
  window.history.replaceState(null, "", academyPath);

  const router = createMemoryRouter(
    [
      { path: "/administracion/academias", element: <p>Lista</p> },
      {
        path: "/administracion/academias/:academyId",
        action: async () => {
          saves += 1;

          return null;
        },
        element: (
          <AcademyDetailRouteView
            actionData={actionData}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
            loaderData={buildLoaderData(canEdit)}
          />
        ),
      },
    ],
    { initialEntries: [academyPath] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return { pathname: () => router.state.location.pathname, saves: () => saves };
}

function readInput(name: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );

  if (!input) {
    throw new Error(`Expected an input named "${name}".`);
  }

  return input;
}

async function typeInto(name: string, value: string) {
  await updateReactDomForm(() => {
    setInputValue(readInput(name), value);
  });
}

function isGuardarEnabled() {
  const button = findButton("Guardar", { exact: true });

  return button !== undefined && !(button as HTMLButtonElement).disabled;
}

const findDialog = () =>
  document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/**
 * The actions menu only mounts its items once it opens, and the trigger opens on
 * `pointerdown` rather than on `click`.
 */
async function openActionsMenu() {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Acciones"]',
  );

  if (!trigger) {
    throw new Error("Expected the actions menu trigger to be rendered.");
  }

  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });

  return trigger;
}

/** Scoped to the dialog, so the edit form's own `intent` is not what is read. */
function readDialogHiddenValue(name: string) {
  const dialog = document.querySelector('[role="alertdialog"]');

  if (!dialog) {
    throw new Error("Expected the delete dialog to be rendered.");
  }

  return dialog.querySelector<HTMLInputElement>(
    `input[type="hidden"][name="${name}"]`,
  )?.value;
}

describe("AcademyDetailRouteView", () => {
  test("opens the delete dialog from the actions menu", async () => {
    await renderDetail();
    await openActionsMenu();

    const item = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((candidate) => candidate.textContent === "Eliminar");

    if (!item) {
      throw new Error("Expected the delete menu item to be rendered.");
    }

    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Eliminar academia");
    expect(document.body.textContent).toContain("Academia Fork");
    expect(document.body.textContent).toContain("Esta acción es irreversible.");
  });

  test("submits the delete intent with the academy's own confirmation", async () => {
    await renderDetail({ initialDeleteDialogOpen: true });

    expect(readDialogHiddenValue("intent")).toBe("delete-academy");
    expect(readDialogHiddenValue("id")).toBe("academy_1");
    expect(readDialogHiddenValue("confirmDeletion")).toBe("academy_1");
  });

  test("offers no delete action to a read-only auditor", async () => {
    await renderDetail({ canEdit: false, initialDeleteDialogOpen: true });

    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Eliminar academia");
  });

  test("keeps `Guardar` off and offers no `Descartar cambios` while nothing changed", async () => {
    await renderDetail();

    expect(isGuardarEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();
  });

  test("turns `Guardar` on with a change, and `Descartar cambios` puts back what is saved", async () => {
    await renderDetail();

    await typeInto("name", "Academia Nueva");

    expect(isGuardarEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(readInput("name").value).toBe("Academia Fork");
    expect(isGuardarEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();
  });

  test("asks before leaving with changes and lets the save through without asking", async () => {
    const page = await renderDetail();

    await typeInto("name", "Academia Nueva");
    await clickReactDomButton("Guardar", { exact: true });
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.saves()).toBe(1);
    expect(page.pathname()).toBe(academyPath);

    await act(async () => {
      document
        .querySelector("a[href='/administracion/academias']")
        ?.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            button: 0,
            cancelable: true,
          }),
        );
    });
    await settle();

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");
    expect(page.pathname()).toBe(academyPath);
  });

  test("leaves without asking when nothing changed", async () => {
    const page = await renderDetail();

    await act(async () => {
      document
        .querySelector("a[href='/administracion/academias']")
        ?.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            button: 0,
            cancelable: true,
          }),
        );
    });
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/administracion/academias");
  });

  test("keeps `Guardar` on after the server refused a save, with what was typed back in the form", async () => {
    await renderDetail({
      actionData: {
        fieldErrors: {},
        intent: "update-academy",
        message: "No pudimos guardar los cambios.",
        status: "error",
        values: {
          contactName: "Nora Norte",
          name: "Academia Rechazada",
          phone: "3415551234",
        },
      },
    });
    await settle();

    expect(readInput("name").value).toBe("Academia Rechazada");
    expect(isGuardarEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(readInput("name").value).toBe("Academia Fork");
    expect(isGuardarEnabled()).toBe(false);
  });

  test("shows a read-only auditor the fields disabled and only `Volver`", async () => {
    await renderDetail({ canEdit: false });

    expect(readInput("name").disabled).toBe(true);
    expect(findButton("Guardar", { exact: true })).toBeUndefined();
    expect(findButton("Descartar cambios")).toBeUndefined();
    expect(
      document.querySelector("a[href='/administracion/academias']"),
    ).not.toBeNull();
  });
});

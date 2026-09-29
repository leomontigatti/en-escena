/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { CategoryDetailView } from "@/features/admin/categories/detail/view";
import type {
  CategoryActionData,
  CategoryDetailLoaderData,
} from "@/features/admin/categories/shared";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

const detailPath = "/administracion/categorias/category_1";
const listPath = "/administracion/categorias";

const loaderData = {
  category: {
    experienceLevels: [],
    groupTypes: ["solo"],
    id: "category_1",
    maxAge: 12,
    minAge: 8,
    modalityIds: ["modality_1"],
    name: "Infantil",
  },
  modalities: [{ id: "modality_1", name: "Jazz" }],
  selectedEventId: "event_1",
} as unknown as CategoryDetailLoaderData;

describe("the category detail as one draft", () => {
  test("keeps `Guardar` off until a change, and `Descartar cambios` puts back what is saved", async () => {
    await renderPage();

    expect(isGuardarEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();

    await typeName("Juvenil");

    expect(isGuardarEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(readName().value).toBe("Infantil");
    expect(isGuardarEnabled()).toBe(false);
  });

  test("asks before leaving with changes, and lets the save through without asking", async () => {
    const page = await renderPage();

    await typeName("Juvenil");
    await clickReactDomButton("Guardar", { exact: true });
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.saves()).toBe(1);
    expect(page.pathname()).toBe(detailPath);

    await clickBack();

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");
    expect(page.pathname()).toBe(detailPath);
  });

  test("leaves without asking while nothing changed", async () => {
    const page = await renderPage();

    await clickBack();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe(listPath);
  });

  test("keeps `Guardar` on after a refused save, and discards back to what is saved", async () => {
    await renderPage({
      actionData: {
        message: "No pudimos guardar la categoría.",
        scope: { intent: "update-category", recordId: "category_1" },
        status: "error",
        values: {
          experienceLevels: [],
          groupTypes: ["solo"],
          maxAge: "12",
          minAge: "8",
          modalityIds: ["modality_1"],
          name: "Rechazada",
        },
      } as unknown as CategoryActionData,
    });
    await settle();

    expect(readName().value).toBe("Rechazada");
    expect(isGuardarEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(readName().value).toBe("Infantil");
    expect(isGuardarEnabled()).toBe(false);
  });
});

async function renderPage({
  actionData,
}: { actionData?: CategoryActionData } = {}) {
  let saves = 0;

  // The form posts to the URL the document says, which the memory router does
  // not set.
  window.history.replaceState(null, "", detailPath);

  const router = createMemoryRouter(
    [
      { element: <p>Lista</p>, path: listPath },
      {
        action: () => {
          saves += 1;

          return null;
        },
        element: (
          <CategoryDetailView actionData={actionData} loaderData={loaderData} />
        ),
        path: detailPath,
      },
    ],
    { initialEntries: [detailPath] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return { pathname: () => router.state.location.pathname, saves: () => saves };
}

function readName() {
  const input = document.querySelector<HTMLInputElement>('input[name="name"]');

  if (!input) {
    throw new Error("Expected the name input.");
  }

  return input;
}

async function typeName(value: string) {
  await updateReactDomForm(() => {
    setInputValue(readName(), value);
  });
}

function isGuardarEnabled() {
  const button = findButton("Guardar", { exact: true });

  return button !== undefined && !(button as HTMLButtonElement).disabled;
}

function findDialog() {
  return (
    document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined
  );
}

async function clickBack() {
  await act(async () => {
    document
      .querySelector(`a[href='${listPath}']`)
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }),
      );
  });
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

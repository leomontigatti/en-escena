/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, Form, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { FormActions } from "@/components/shared/form-actions";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

describe("FormActions", () => {
  test("keeps `Guardar` off and hides `Descartar cambios` while nothing changed", async () => {
    await renderPage({ hasChanges: false });

    expect(isSaveEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();
  });

  test("turns `Guardar` on and offers `Descartar cambios` once something changed", async () => {
    const page = await renderPage({ hasChanges: true });

    expect(isSaveEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(page.discards()).toBe(1);
    expect(isSaveEnabled()).toBe(false);
  });

  test("keeps `Guardar` off while the form says it cannot save yet", async () => {
    await renderPage({ canSave: false, hasChanges: true });

    expect(isSaveEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeDefined();
  });

  test("shows only `Volver` to someone who may not edit", async () => {
    const page = await renderPage({ canEdit: false, hasChanges: true });

    expect(findButton("Guardar", { exact: true })).toBeUndefined();
    expect(findButton("Descartar cambios")).toBeUndefined();

    await clickLink("Volver");

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/lista");
  });

  test("leaves without asking while nothing changed", async () => {
    const page = await renderPage({ hasChanges: false });

    await clickLink("Volver");

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/lista");
  });

  test("asks before leaving with changes, through `Volver` or any other link", async () => {
    const page = await renderPage({ hasChanges: true });

    await clickLink("Volver");

    expect(findDialog()?.textContent).toContain("¿Descartar los cambios?");

    await clickReactDomButton("Seguir editando");
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/detalle");

    await clickLink("Otra pantalla");
    await clickReactDomButton("Descartar", { exact: true });
    await settle();

    expect(page.pathname()).toBe("/otra");
  });

  test("lets its own save through without asking", async () => {
    const page = await renderPage({ hasChanges: true });

    await clickReactDomButton("Guardar");
    await settle();

    expect(findDialog()).toBeUndefined();
    expect(page.saves()).toBe(1);
    expect(page.pathname()).toBe("/detalle");
  });
});

async function renderPage(input: {
  canEdit?: boolean;
  canSave?: boolean;
  hasChanges: boolean;
}) {
  let discards = 0;
  let saves = 0;

  function Page() {
    const [hasChanges, setHasChanges] = useState(input.hasChanges);

    return (
      <Form method="post">
        <FormActions
          backTo="/lista"
          canEdit={input.canEdit}
          canSave={input.canSave}
          hasChanges={hasChanges}
          isPending={false}
          onDiscard={() => {
            discards += 1;
            setHasChanges(false);
          }}
        />
      </Form>
    );
  }

  const router = createMemoryRouter(
    [
      { element: <p>Lista</p>, path: "/lista" },
      { element: <p>Otra</p>, path: "/otra" },
      {
        action: () => {
          saves += 1;

          return { status: "success" };
        },
        element: (
          <>
            <OtherLink />
            <Page />
          </>
        ),
        path: "/detalle",
      },
    ],
    { initialEntries: ["/detalle"] },
  );

  function OtherLink() {
    return (
      <button type="button" onClick={() => void router.navigate("/otra")}>
        Otra pantalla
      </button>
    );
  }

  await renderer.renderAsync(<RouterProvider router={router} />);

  return {
    discards: () => discards,
    pathname: () => router.state.location.pathname,
    saves: () => saves,
  };
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

async function clickLink(text: string) {
  const target = Array.from(
    document.querySelectorAll<HTMLElement>("a, button"),
  ).find((candidate) => candidate.textContent?.trim() === text);

  if (!target) {
    throw new Error(`Expected a "${text}" link.`);
  }

  await act(async () => {
    target.dispatchEvent(
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

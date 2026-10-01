/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

import { OrderingConfirmationDialog, PresentationDayTabs } from "./notices";
import {
  orderAutomaticallyIntent,
  type PresentationListResult,
} from "./shared";

describe("PresentationDayTabs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // The days are a filter on one list: Back leaves the list instead of
  // stepping through the days, and a page number belongs to the day it was
  // read on.
  test("switches the day in place, from the first page", async () => {
    const router = createMemoryRouter(
      [
        { path: "/administracion", element: null },
        {
          path: "/administracion/presentacion",
          element: (
            <PresentationDayTabs
              loaderData={
                {
                  days: ["2026-05-01", "2026-05-02"],
                } as PresentationListResult
              }
            />
          ),
        },
      ],
      {
        initialEntries: [
          "/administracion",
          "/administracion/presentacion?pagina=3&advertencias=con",
        ],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await selectTab(2);
    await selectTab(1);

    expect(router.state.location.search).toBe(
      "?advertencias=con&dia=2026-05-01",
    );
    expect(
      document
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent?.trim(),
    ).not.toBe("Todos");

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/administracion");
  });

  // Radix activates a trigger on `mousedown`, not on the click after it.
  async function selectTab(index: number) {
    await act(async () => {
      document
        .querySelectorAll('[role="tab"]')
        [index]!.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
    });
  }
});

describe("OrderingConfirmationDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  async function renderDialog(
    onOpenChange: (open: boolean) => void = () => {},
    frozenCount = 0,
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentacion",
          action: async () => null,
          element: (
            <OrderingConfirmationDialog
              frozenCount={frozenCount}
              open
              onOpenChange={onOpenChange}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentacion"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function submittingNavigation() {
    const formData = new FormData();
    formData.set("intent", orderAutomaticallyIntent);

    return { formData, formMethod: "post", state: "submitting" };
  }

  test("spells out what the ordering does and that it cannot be undone", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDialog();

    expect(document.body.textContent).toContain(
      "Las coreografías elegibles se ordenan por defecto y se les asigna un número de presentación nuevo.",
    );
    expect(document.body.textContent).toContain(
      "Esta acción es irreversible y modifica cualquier orden manual realizado.",
    );
    expect(getButton("Confirmar").disabled).toBe(false);
  });

  test("says the presentations of an evaluated schedule keep their number", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDialog(undefined, 40);

    expect(document.body.textContent).toContain(
      "Las presentaciones de un cronograma ya evaluado no cambian de número.",
    );
  });

  test("disables both answers while its own ordering is in flight", async () => {
    useNavigationMock.mockReturnValue(submittingNavigation());

    await renderDialog();

    expect(getButton("Confirmar").disabled).toBe(true);
    expect(getButton("Cancelar").disabled).toBe(true);
  });

  test("leaves the confirmation alone while another submission is in flight", async () => {
    const formData = new FormData();
    formData.set("intent", "move-presentation");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDialog();

    expect(getButton("Confirmar").disabled).toBe(false);
  });

  // The ordering stays on the list, so nothing navigates the dialog away. Left
  // open, it would sit an enabled `Confirmar` in front of the administrator after
  // the order was already written, and a second press would throw away the
  // manual moves the first one just made.
  test("closes itself once its ordering settles", async () => {
    const onOpenChange = vi.fn();

    useNavigationMock.mockReturnValue(submittingNavigation());
    await renderDialog(onOpenChange);

    expect(onOpenChange).not.toHaveBeenCalled();

    useNavigationMock.mockReturnValue({ state: "idle" });
    await renderer.renderAsync(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: "/administracion/presentacion",
              action: async () => null,
              element: (
                <OrderingConfirmationDialog
                  frozenCount={0}
                  open
                  onOpenChange={onOpenChange}
                />
              ),
            },
          ],
          { initialEntries: ["/administracion/presentacion"] },
        )}
      />,
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

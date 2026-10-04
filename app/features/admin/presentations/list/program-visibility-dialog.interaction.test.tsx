/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { ProgramVisibilityDialog } from "./program-visibility-dialog";

describe("the program visibility confirmation", () => {
  const renderer = createReactDomTestRenderer();
  const submitted = vi.fn((_form: FormData) => null);

  afterEach(() => {
    renderer.cleanup();
    submitted.mockClear();
  });

  async function mount(show: boolean) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          action: async ({ request }) => submitted(await request.formData()),
          element: (
            <ProgramVisibilityDialog
              eventId="event-1"
              onClose={vi.fn()}
              show={show}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentaciones"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function confirmButton() {
    return [...document.querySelectorAll("button")].find(
      (button) => button.type === "submit",
    );
  }

  test("shows the program of the event it was opened for", async () => {
    await mount(true);

    expect(document.querySelector('[role="alertdialog"] h2')?.textContent).toBe(
      "¿Mostrar programa?",
    );
    expect(confirmButton()?.textContent).toBe("Mostrar programa");

    await act(async () => {
      confirmButton()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(submitted).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(submitted.mock.calls[0][0])).toEqual({
      evento: "event-1",
      intent: "set-program-visibility",
      visible: "true",
    });
  });

  test("hides a visible program", async () => {
    await mount(false);

    expect(document.querySelector('[role="alertdialog"] h2')?.textContent).toBe(
      "¿Ocultar programa?",
    );

    await act(async () => {
      confirmButton()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(Object.fromEntries(submitted.mock.calls[0][0])).toMatchObject({
      visible: "false",
    });
  });
});

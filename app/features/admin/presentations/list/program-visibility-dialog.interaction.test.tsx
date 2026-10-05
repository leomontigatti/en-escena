/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { ProgramVisibilityDialog } from "./program-visibility-dialog";

describe("the program visibility dialog", () => {
  const renderer = createReactDomTestRenderer();
  const answer = vi.fn(
    (): { message: string; status: "error" | "success" } | null => null,
  );
  const submitted = vi.fn((_form: FormData) => answer());
  const onClose = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    submitted.mockClear();
    answer.mockReset();
    answer.mockReturnValue(null);
    onClose.mockClear();
  });

  async function mount(days: Array<{ day: string; visible: boolean }>) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          action: async ({ request }) => submitted(await request.formData()),
          element: (
            <ProgramVisibilityDialog
              days={days}
              eventId="event-1"
              onClose={onClose}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentaciones"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function checkbox(label: string) {
    const card = [
      ...document.querySelectorAll('[data-slot="choice-card"]'),
    ].find((element) => element.textContent === label);

    return card?.querySelector<HTMLButtonElement>('[role="checkbox"]');
  }

  function button(label: string) {
    return [...document.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );
  }

  function saveButton() {
    return [...document.querySelectorAll("button")].find(
      (button) => button.type === "submit",
    );
  }

  async function click(element: HTMLElement | null | undefined) {
    await act(async () => {
      element?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  test("lists each day as it is now, and saves nothing until one changes", async () => {
    await mount([
      { day: "2026-12-04", visible: true },
      { day: "2026-12-05", visible: false },
    ]);

    expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe(
      "Mostrar/ocultar programa",
    );
    expect(checkbox("Viernes 4/12")?.getAttribute("aria-checked")).toBe("true");
    expect(checkbox("Sábado 5/12")?.getAttribute("aria-checked")).toBe("false");
    expect(saveButton()?.textContent).toBe("Guardar");
    expect(saveButton()?.disabled).toBe(true);
  });

  test("sends the whole set of visible days for the event it was opened for", async () => {
    await mount([
      { day: "2026-12-04", visible: true },
      { day: "2026-12-05", visible: false },
    ]);

    await click(checkbox("Sábado 5/12"));
    await click(saveButton());

    expect(submitted).toHaveBeenCalledTimes(1);

    const form = submitted.mock.calls[0][0];

    expect(form.get("intent")).toBe("set-program-visibility");
    expect(form.get("evento")).toBe("event-1");
    expect(form.getAll("dia")).toEqual(["2026-12-04", "2026-12-05"]);
  });

  test("sends no day at all when every day is unchecked", async () => {
    await mount([{ day: "2026-12-04", visible: true }]);

    await click(checkbox("Viernes 4/12"));
    await click(saveButton());

    expect(submitted.mock.calls[0][0].getAll("dia")).toEqual([]);
  });

  test("closes once the save succeeds, and stays open over a refusal", async () => {
    await mount([{ day: "2026-12-04", visible: false }]);

    answer.mockReturnValueOnce({
      message: "El evento activo cambió mientras tanto.",
      status: "error",
    });
    await click(checkbox("Viernes 4/12"));
    await click(saveButton());

    expect(onClose).not.toHaveBeenCalled();
    expect(checkbox("Viernes 4/12")?.getAttribute("aria-checked")).toBe("true");

    answer.mockReturnValueOnce({
      message: "Programa visible del viernes 4/12.",
      status: "success",
    });
    await click(saveButton());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("asks before dropping unsaved picks", async () => {
    await mount([{ day: "2026-12-04", visible: false }]);

    await click(checkbox("Viernes 4/12"));
    await click(button("Cancelar"));

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  test("closes without asking when nothing changed", async () => {
    await mount([{ day: "2026-12-04", visible: false }]);

    await click(button("Cancelar"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

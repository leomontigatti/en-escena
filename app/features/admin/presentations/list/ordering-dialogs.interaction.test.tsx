/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { AutomaticOrderingDialogs } from "./ordering-dialogs";
import { orderAutomaticallyIntent, orderDayFieldName } from "./shared";

/** The list's own way of holding the dialogs: mounted only while open. */
function OrderingOwner(props: { days: string[]; frozenDays: string[] }) {
  const [isOpen, setIsOpen] = useState(true);

  return isOpen ? (
    <AutomaticOrderingDialogs {...props} onClose={() => setIsOpen(false)} />
  ) : null;
}

describe("AutomaticOrderingDialogs", () => {
  const renderer = createReactDomTestRenderer();
  const submitted = vi.fn((_form: FormData) => null);

  afterEach(() => {
    renderer.cleanup();
    submitted.mockClear();
  });

  async function mount(input: { days: string[]; frozenDays?: string[] }) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          action: async ({ request }) => submitted(await request.formData()),
          element: (
            <OrderingOwner
              days={input.days}
              frozenDays={input.frozenDays ?? []}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentaciones"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function isAnyDialogOpen() {
    return (
      document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
    );
  }

  function checkbox(label: string) {
    const card = [
      ...document.querySelectorAll('[data-slot="choice-card"]'),
    ].find((candidate) => candidate.textContent === label);

    return card?.querySelector<HTMLButtonElement>('[role="checkbox"]');
  }

  async function click(target: HTMLElement | null | undefined) {
    await act(async () => {
      target?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  test("asks for the days first, and orders the whole event when none is chosen", async () => {
    await mount({ days: ["2026-12-04", "2026-12-05"] });

    expect(checkbox("Viernes 4/12")).toBeTruthy();
    expect(checkbox("Sábado 5/12")).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Sin días elegidos, se ordena todo el evento.",
    );

    await click(getButton("Continuar"));

    expect(document.body.textContent).toContain(
      "Las coreografías elegibles de todo el evento se ordenan por defecto y se les asigna un número de presentación nuevo.",
    );
    expect(document.body.textContent).toContain(
      "Esta acción es irreversible y modifica cualquier orden manual realizado.",
    );

    await click(getButton("Ordenar"));

    expect(isAnyDialogOpen()).toBe(false);
    expect(submitted).toHaveBeenCalledOnce();
    expect(submitted.mock.calls[0][0].get("intent")).toBe(
      orderAutomaticallyIntent,
    );
    expect(submitted.mock.calls[0][0].getAll(orderDayFieldName)).toEqual([]);
  });

  test("names the chosen days in the confirmation and submits them", async () => {
    await mount({ days: ["2026-12-04", "2026-12-05", "2026-12-06"] });
    await click(checkbox("Domingo 6/12"));
    await click(checkbox("Viernes 4/12"));
    await click(getButton("Continuar"));

    expect(document.body.textContent).toContain(
      "Las coreografías elegibles de los días viernes 4/12 y domingo 6/12 se ordenan",
    );

    await click(getButton("Ordenar"));

    expect(submitted.mock.calls[0][0].getAll(orderDayFieldName)).toEqual([
      "2026-12-04",
      "2026-12-06",
    ]);
  });

  test("goes back to the days, with the choice kept, from the confirmation", async () => {
    await mount({ days: ["2026-12-04", "2026-12-05"] });
    await click(checkbox("Sábado 5/12"));
    await click(getButton("Continuar"));

    expect(document.body.textContent).toContain(
      "Las coreografías elegibles del sábado 5/12 se ordenan",
    );

    await click(getButton("Cancelar"));

    expect(checkbox("Sábado 5/12")?.getAttribute("aria-checked")).toBe("true");

    await click(getButton("Cancelar"));

    expect(isAnyDialogOpen()).toBe(false);
  });

  test("skips the days of a one-day event and closes from the confirmation", async () => {
    await mount({ days: ["2026-12-04"] });

    expect(checkbox("Viernes 4/12")).toBeFalsy();
    expect(document.body.textContent).toContain(
      "Las coreografías elegibles de todo el evento se ordenan",
    );

    await click(getButton("Cancelar"));

    expect(isAnyDialogOpen()).toBe(false);
  });

  test("warns of the fixed presentations only when the chosen days hold some", async () => {
    const fixedNote =
      "Las presentaciones de un cronograma ya evaluado no cambian de número.";

    await mount({
      days: ["2026-12-04", "2026-12-05"],
      frozenDays: ["2026-12-04"],
    });
    await click(checkbox("Sábado 5/12"));
    await click(getButton("Continuar"));

    expect(document.body.textContent).not.toContain(fixedNote);

    await click(getButton("Cancelar"));
    await click(checkbox("Sábado 5/12"));
    await click(getButton("Continuar"));

    expect(document.body.textContent).toContain(fixedNote);
  });
});

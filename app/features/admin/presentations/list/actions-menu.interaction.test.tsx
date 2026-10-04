/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { openRadixSelect } from "@/lib/test-support/radix-select";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PresentationListActions } from "./actions-menu";

describe("the participation list's actions menu", () => {
  const renderer = createReactDomTestRenderer();
  const onExportProgram = vi.fn();
  const onToggleProgram = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    onExportProgram.mockClear();
    onToggleProgram.mockClear();
  });

  async function mount(
    canExportProgram: boolean,
    programToggle: { eventId: string; show: boolean } | null = null,
  ) {
    // Nothing to order, print or download: only what each test offers.
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          element: (
            <PresentationListActions
              canDownloadMusic={false}
              canExportProgram={canExportProgram}
              canOrderRows={false}
              canPrintResults={false}
              hasSelection={false}
              onDownloadMusic={vi.fn()}
              onExportProgram={onExportProgram}
              onJudges={vi.fn()}
              onOrder={vi.fn()}
              onPrintResults={vi.fn()}
              onToggleProgram={onToggleProgram}
              programToggle={programToggle}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentaciones"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function menuItems() {
    return [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    );
  }

  test("offers the program export on its own", async () => {
    await mount(true);

    await openRadixSelect(document.querySelector('[aria-label="Acciones"]'));

    expect(menuItems()).toEqual(["Descargar programa"]);
  });

  test("opens the confirmation to show the program", async () => {
    await mount(false, { eventId: "event-1", show: true });

    await openRadixSelect(document.querySelector('[aria-label="Acciones"]'));

    expect(menuItems()).toEqual(["Mostrar programa"]);

    await act(async () => {
      document.querySelector<HTMLElement>('[role="menuitem"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onToggleProgram).toHaveBeenCalledTimes(1);
  });

  test("offers to hide a visible program", async () => {
    await mount(false, { eventId: "event-1", show: false });

    await openRadixSelect(document.querySelector('[aria-label="Acciones"]'));

    expect(menuItems()).toEqual(["Ocultar programa"]);
  });

  test("leaves the menu out when nothing is numbered yet", async () => {
    await mount(false);

    expect(document.querySelector('[aria-label="Acciones"]')).toBeNull();
  });
});

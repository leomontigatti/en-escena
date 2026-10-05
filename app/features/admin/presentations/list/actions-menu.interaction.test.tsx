/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { openRadixSelect } from "@/lib/test-support/radix-select";
import {
  createReactDomTestRenderer,
  findButton,
} from "@/lib/test-support/react-dom";

import { PresentationListActions } from "./actions-menu";

describe("the participation list's actions menu", () => {
  const renderer = createReactDomTestRenderer();
  const onExportProgram = vi.fn();
  const onProgramVisibility = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    onExportProgram.mockClear();
    onProgramVisibility.mockClear();
  });

  async function mount(
    canExportProgram: boolean,
    canSetProgramVisibility = false,
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
              canSetProgramVisibility={canSetProgramVisibility}
              canOrderRows={false}
              hasSelection={false}
              onDownloadMusic={vi.fn()}
              onExportProgram={onExportProgram}
              onJudges={vi.fn()}
              onOrder={vi.fn()}
              onProgramVisibility={onProgramVisibility}
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

    await openRadixSelect(findButton("Acciones", { exact: true }));

    expect(menuItems()).toEqual(["Descargar programa"]);
  });

  test("offers to show or hide the program's days", async () => {
    await mount(false, true);

    await openRadixSelect(findButton("Acciones", { exact: true }));

    expect(menuItems()).toEqual(["Mostrar/ocultar programa"]);
  });

  test("leaves the menu out when nothing is numbered yet", async () => {
    await mount(false);

    expect(findButton("Acciones", { exact: true })).toBeUndefined();
  });
});

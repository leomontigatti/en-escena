/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";

import { openRadixSelect } from "@/lib/test-support/radix-select";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PresentationListActions } from "./actions-menu";

describe("the participation list's actions menu", () => {
  const renderer = createReactDomTestRenderer();
  const onExportProgram = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    onExportProgram.mockClear();
  });

  async function mount(canExportProgram: boolean) {
    // Nothing to order, print or download yet: only the export is on offer.
    await renderer.renderAsync(
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
      />,
    );
  }

  test("offers the program export on its own", async () => {
    await mount(true);

    await openRadixSelect(document.querySelector('[aria-label="Acciones"]'));

    expect(
      [...document.querySelectorAll('[role="menuitem"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Descargar programa (Excel)"]);
  });

  test("leaves the menu out when nothing is numbered yet", async () => {
    await mount(false);

    expect(document.querySelector('[aria-label="Acciones"]')).toBeNull();
  });
});

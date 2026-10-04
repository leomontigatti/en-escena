/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { DayExportDialog } from "./dialog";

describe("the day export dialog", () => {
  const renderer = createReactDomTestRenderer();
  const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
  const onOpenChange = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    openWindow.mockClear();
    onOpenChange.mockClear();
  });

  async function mount() {
    await renderer.renderAsync(
      <DayExportDialog
        days={["2026-10-10", "2026-10-11"]}
        description="Elegí el día, o todos."
        onOpenChange={onOpenChange}
        open
        path="/administracion/presentaciones/exportar"
        title="Descargar programa"
      />,
    );
  }

  // The form validates before it downloads, which settles after the click.
  async function submit() {
    await clickReactDomButton("Descargar");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  async function pick(label: string) {
    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );
    await selectRadixOption(label);
  }

  test("offers every day first, then each day", async () => {
    await mount();

    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );

    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent,
      ),
    ).toEqual(["Todos", "Sábado 10/10", "Domingo 11/10"]);
  });

  test("downloads the whole event", async () => {
    await mount();

    await pick("Todos");
    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/presentaciones/exportar?dia=todos",
      "_self",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("downloads the day picked", async () => {
    await mount();

    await pick("Domingo 11/10");
    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/presentaciones/exportar?dia=2026-10-11",
      "_self",
    );
  });

  test("starts with nothing chosen, and asks for a choice", async () => {
    await mount();

    await submit();

    expect(openWindow).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(requiredFieldMessage);
  });
});

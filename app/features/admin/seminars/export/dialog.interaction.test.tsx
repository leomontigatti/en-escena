/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { SeminarExportDialog } from "./dialog";

describe("the seminar export dialog", () => {
  const renderer = createReactDomTestRenderer();
  const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
  const onOpenChange = vi.fn();

  afterEach(() => {
    renderer.cleanup();
    openWindow.mockClear();
    onOpenChange.mockClear();
  });

  async function mount(
    seminars = [
      {
        id: "seminar_1",
        instructorName: "Julio Bocca",
        scheduledDate: "2026-05-02",
        startTime: "10:00",
      },
      {
        id: "seminar_2",
        instructorName: "Alicia Alonso",
        scheduledDate: "2026-05-03",
        startTime: "10:00",
      },
    ],
  ) {
    await renderer.renderAsync(
      <SeminarExportDialog
        onOpenChange={onOpenChange}
        open
        seminars={seminars}
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

  test("offers every seminar first, then each by its instructor", async () => {
    await mount();

    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );

    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent,
      ),
    ).toEqual(["Todos los seminarios", "Julio Bocca", "Alicia Alonso"]);
  });

  test("downloads every seminar unless one is picked", async () => {
    await mount();

    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/seminarios/exportar?seminario=todos",
      "_self",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("downloads the seminar picked", async () => {
    await mount();

    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );
    await selectRadixOption("Alicia Alonso");
    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/seminarios/exportar?seminario=seminar_2",
      "_self",
    );
  });

  test("says there is nothing to export while no seminar has inscriptions", async () => {
    await mount([]);

    expect(document.body.textContent).toContain("no hay nada para exportar");
    expect(document.querySelector('[data-slot="select-trigger"]')).toBe(null);
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Descargar",
      ),
    ).toBe(false);
  });
});

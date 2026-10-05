/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { PeriodExportDialog } from "./dialog";
import { periodToBeforeFromMessage } from "./shared";

describe("the period export dialog", () => {
  const renderer = createReactDomTestRenderer();
  const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
  const onOpenChange = vi.fn();
  // The calendar opens on the current month; the test picks days in it.
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const isoDay = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  afterEach(() => {
    renderer.cleanup();
    openWindow.mockClear();
    onOpenChange.mockClear();
  });

  async function mount() {
    await renderer.renderAsync(
      <PeriodExportDialog
        description="Elegí el período."
        onOpenChange={onOpenChange}
        open
        path="/administracion/profesores/exportar"
        title="Exportar profesores"
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

  async function pickDay(trigger: string, day: number) {
    await clickReactDomButton(trigger);
    const dayButton = document.querySelector<HTMLButtonElement>(
      `button[data-day="${new Date(year, month, day).toLocaleDateString("es")}"]`,
    );

    if (!dayButton) {
      throw new Error(`The calendar offers no day ${day}.`);
    }

    await act(async () => {
      dayButton.click();
    });
  }

  test("downloads the whole event when both dates are left empty", async () => {
    await mount();

    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/profesores/exportar",
      "_self",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("downloads the period picked, each end in its own parameter", async () => {
    await mount();

    await pickDay("Desde el inicio", 3);
    await pickDay("Hasta hoy", 12);
    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      `/administracion/profesores/exportar?desde=${isoDay(3)}&hasta=${isoDay(12)}`,
      "_self",
    );
  });

  test("downloads from a day on, with the other end open", async () => {
    await mount();

    await pickDay("Desde el inicio", 5);
    await submit();

    expect(openWindow).toHaveBeenCalledWith(
      `/administracion/profesores/exportar?desde=${isoDay(5)}`,
      "_self",
    );
  });

  test("refuses a period that ends before it starts", async () => {
    await mount();

    await pickDay("Desde el inicio", 12);
    await pickDay("Hasta hoy", 3);
    await submit();

    expect(openWindow).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(periodToBeforeFromMessage);
  });
});

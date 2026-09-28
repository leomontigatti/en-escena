/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";
import type { EventProgramSchedule } from "@/lib/presentations/event-program.server";

import { ResultsPrintDialog } from "./results-print-dialog";

const saturdayMorning: EventProgramSchedule = {
  id: "schedule-1",
  name: "Sábado mañana",
  scheduledDate: "2026-05-02",
  startTime: "10:00",
};
const saturdayAfternoon: EventProgramSchedule = {
  id: "schedule-2",
  name: "Sábado tarde",
  scheduledDate: "2026-05-02",
  startTime: "16:00",
};

describe("the results print dialog", () => {
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
      <ResultsPrintDialog
        onOpenChange={onOpenChange}
        open
        schedules={[saturdayMorning, saturdayAfternoon]}
      />,
    );
  }

  function scheduleCheckbox(label: string) {
    const row = [...document.querySelectorAll("label")].find(
      (element) => element.textContent === label,
    );
    const checkbox = row?.querySelector('button[role="checkbox"]');

    if (!(checkbox instanceof HTMLButtonElement)) {
      throw new Error(`Expected a checkbox labelled "${label}".`);
    }

    return checkbox;
  }

  async function toggle(label: string) {
    await act(async () => {
      scheduleCheckbox(label).click();
      await Promise.resolve();
    });
  }

  // The form validates before it prints, which settles after the click.
  async function submit() {
    await clickReactDomButton("Imprimir");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  test("labels each schedule the way the print heading does, in order", async () => {
    await mount();

    const labels = [...document.querySelectorAll("label")].map(
      (element) => element.textContent,
    );

    expect(labels).toEqual([
      "sábado 2 de mayo 10:00 hs · Sábado mañana",
      "sábado 2 de mayo 16:00 hs · Sábado tarde",
    ]);
  });

  test("opens the print of every chosen schedule in a new tab", async () => {
    await mount();

    await toggle("sábado 2 de mayo 16:00 hs · Sábado tarde");
    await toggle("sábado 2 de mayo 10:00 hs · Sábado mañana");
    await submit();

    // In the order the schedules run, whatever order they were ticked in.
    expect(openWindow).toHaveBeenCalledWith(
      "/administracion/presentacion/resultados/imprimir?cronograma=schedule-1&cronograma=schedule-2",
      "_blank",
      "noopener",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("says so rather than printing nothing", async () => {
    await mount();

    await submit();

    expect(document.body.textContent).toContain(
      "Elegí al menos un cronograma.",
    );
    expect(openWindow).not.toHaveBeenCalled();
  });
});

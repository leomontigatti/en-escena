/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { SubmodalityCriteriaDialog } from "@/features/admin/modalities/criteria-dialog";
import type {
  EventSubmodalityCriterionRow,
  EventSubmodalityRow,
} from "@/features/admin/modalities/shared";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const submodality: EventSubmodalityRow = {
  id: "submodality_1",
  eventId: "event_1",
  modalityId: "modality_1",
  name: "Acrobacia",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("SubmodalityCriteriaDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderDialog(
    criteria: EventSubmodalityCriterionRow[],
    options: { locked?: boolean } = {},
  ) {
    await renderer.renderAsync(
      <SubmodalityCriteriaDialog
        criteria={criteria}
        locked={options.locked ?? false}
        modalityId="modality_1"
        onOpenChange={() => {}}
        open
        submodality={submodality}
      />,
    );
  }

  test("says what an empty list means", async () => {
    await renderDialog([]);

    expect(document.body.textContent).toContain(
      "Sin criterios, se puntúa con un único valor de 0 a 100",
    );
    expect(getCounter().textContent).toBe("0 / 100");
    expect(getTotalField().dataset.invalid).toBeUndefined();
  });

  test("counts the adding maxima against 100 and leaves the deductions out", async () => {
    await renderDialog([
      criterion({ id: "criterion_1", maximum: 70, name: "Técnica" }),
      criterion({ id: "criterion_2", maximum: 30, name: "Interpretación" }),
      criterion({
        id: "criterion_3",
        kind: "deducts",
        maximum: 10,
        name: "Caídas",
      }),
    ]);

    expect(getCounter().textContent).toBe("100 / 100");
    expect(getTotalField().dataset.invalid).toBeUndefined();
    expect(document.body.textContent).not.toContain(
      "El total de los criterios que suman debe ser igual a 100.",
    );
  });

  test("turns the counter and its label red while the total is wrong", async () => {
    await renderDialog([
      criterion({ id: "criterion_1", maximum: 70, name: "Técnica" }),
    ]);

    expect(getCounter().textContent).toBe("70 / 100");
    expect(getTotalField().dataset.invalid).toBe("true");
    expect(getTotalField().textContent).toContain("Suman");
    expect(document.body.textContent).toContain(
      "El total de los criterios que suman debe ser igual a 100.",
    );
  });

  test("follows the typed maxima as the total is distributed", async () => {
    await renderDialog([
      criterion({ id: "criterion_1", maximum: 70, name: "Técnica" }),
    ]);

    await updateReactDomForm(() => {
      setInputValue(getMaximumInput(0), "100");
    });

    expect(getCounter().textContent).toBe("100 / 100");
    expect(getTotalField().dataset.invalid).toBeUndefined();
  });

  test("errors a maximum that is not a whole number from 1 only on submit", async () => {
    await renderDialog([
      criterion({ id: "criterion_1", maximum: 100, name: "Técnica" }),
    ]);

    await updateReactDomForm(() => {
      setInputValue(getMaximumInput(0), "0");
    });

    expect(document.body.textContent).not.toContain(
      "Ingresá un número entero desde 1.",
    );

    await submitDialogForm();

    expect(document.body.textContent).toContain(
      "Ingresá un número entero desde 1.",
    );
  });

  test("opens read-only with a notice when the submodality already has scores", async () => {
    await renderDialog(
      [criterion({ id: "criterion_1", maximum: 100, name: "Técnica" })],
      { locked: true },
    );

    expect(document.body.textContent).toContain(
      "Esta submodalidad ya tiene puntajes, así que sus criterios no se pueden cambiar.",
    );
    expect(findButtonByLabel("Guardar")).toBeUndefined();
    expect(findButtonByLabel("Agregar criterio")).toBeUndefined();
    expect(getMaximumInput(0).disabled).toBe(true);
  });

  test("appends an empty criterion, which starts out of the total", async () => {
    await renderDialog([]);

    await clickReactDomButton("Agregar criterio");

    expect(getCounter().textContent).toBe("0 / 100");
    expect(getTotalField().dataset.invalid).toBe("true");
  });
});

function criterion(
  overrides: Partial<EventSubmodalityCriterionRow> & { id: string },
): EventSubmodalityCriterionRow {
  return {
    eventId: "event_1",
    kind: "adds",
    maximum: 100,
    name: "Criterio",
    position: 0,
    submodalityId: submodality.id,
    ...overrides,
  };
}

function findButtonByLabel(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function getCounter() {
  const counter = document.querySelector<HTMLElement>('[role="status"]');

  if (!counter) {
    throw new Error("Expected the adding total counter to be rendered.");
  }

  return counter;
}

/**
 * The field the label, the counter and the message share, and which carries the
 * invalid state all three read their colour from.
 */
function getTotalField() {
  const field = document.querySelector<HTMLElement>("[data-adding-total]");

  if (!field) {
    throw new Error("Expected the adding total field to be rendered.");
  }

  return field;
}

function getMaximumInput(index: number) {
  const input = document.querySelector<HTMLInputElement>(
    `#criterion-maximum-${index}`,
  );

  if (!input) {
    throw new Error(`Expected the maximum field ${index} to be rendered.`);
  }

  return input;
}

async function submitDialogForm() {
  const form = document.querySelector("form");

  if (!form) {
    throw new Error("Expected the criteria form to be rendered.");
  }

  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

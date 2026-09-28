/** @vitest-environment jsdom */

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { ChecklistField } from "./checklist-field";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getReactDomTexts,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

let submittedDancerIds: string[] = [];

function DancersChecklist({ initial = [] }: { initial?: string[] }) {
  const form = useForm({ defaultValues: { dancerIds: initial } });
  submittedDancerIds = form.watch("dancerIds");

  return (
    <ChecklistField
      control={form.control}
      emptySelectionMessage="Todavía no seleccionaste bailarines."
      label="Bailarines"
      name="dancerIds"
      options={[
        { value: "d1", label: "Abril Sosa" },
        { value: "d2", label: "Bea Lagos" },
        { value: "d3", label: "Camila Ríos" },
      ]}
      searchLabel="Buscar bailarines"
    />
  );
}

function getRowNames() {
  return getReactDomTexts('[data-slot="checklist-row"]');
}

function getSearchInput() {
  return document.querySelector<HTMLInputElement>(
    'input[aria-label="Buscar bailarines"]',
  ) as HTMLInputElement;
}

async function clickRow(name: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="checklist-row"]'),
  ).find((candidate) => candidate.textContent === name);

  await updateReactDomForm(() => {
    row?.querySelector("label")?.click();
  });
}

/** Radix tabs switch on mouse down, not on click. */
async function pickTab(name: string) {
  const tab = Array.from(
    document.querySelectorAll<HTMLElement>('[role="tab"]'),
  ).find((candidate) => candidate.textContent?.startsWith(name));

  await updateReactDomForm(() => {
    tab?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
  });
}

describe("ChecklistField", () => {
  test("checks and unchecks a person by tapping anywhere on the row", async () => {
    await renderer.renderAsync(<DancersChecklist />);

    await clickRow("Bea Lagos");
    expect(submittedDancerIds).toEqual(["d2"]);

    await clickRow("Abril Sosa");
    expect(submittedDancerIds).toEqual(["d2", "d1"]);

    await clickRow("Bea Lagos");
    expect(submittedDancerIds).toEqual(["d1"]);
  });

  test("searches ignoring accents and case, and clearing brings everyone back", async () => {
    await renderer.renderAsync(<DancersChecklist />);

    await updateReactDomForm(() => {
      setInputValue(getSearchInput(), "RIOS");
    });
    expect(getRowNames()).toEqual(["Camila Ríos"]);

    await updateReactDomForm(() => {
      setInputValue(getSearchInput(), "zz");
    });
    expect(document.body.textContent).toContain("Sin resultados.");

    await clickReactDomButton("Limpiar búsqueda");
    expect(getRowNames()).toEqual(["Abril Sosa", "Bea Lagos", "Camila Ríos"]);
  });

  test("shows only the checked people under `Seleccionados`, counting them", async () => {
    await renderer.renderAsync(<DancersChecklist />);

    await pickTab("Seleccionados");
    expect(getRowNames()).toEqual([]);
    expect(document.body.textContent).toContain(
      "Todavía no seleccionaste bailarines.",
    );

    await pickTab("Todos");
    await clickRow("Camila Ríos");
    await pickTab("Seleccionados");

    expect(getReactDomTexts('[role="tab"]')).toEqual([
      "Todos",
      "Seleccionados (1)",
    ]);
    expect(getRowNames()).toEqual(["Camila Ríos"]);
  });
});

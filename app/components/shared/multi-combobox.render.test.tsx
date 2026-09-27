/** @vitest-environment jsdom */

// Clearing the search is not clearing the choice. Base UI's own clear button
// empties both, and in a roster picker that would drop every dancer picked.

import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { MultiCombobox } from "./multi-combobox";
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

function DancersPicker() {
  const [value, setValue] = useState(["d1"]);

  return (
    <MultiCombobox
      name="dancerIds"
      options={[
        { value: "d1", label: "Abril Sosa" },
        { value: "d2", label: "Bea Lagos" },
        { value: "d3", label: "Camila Torres" },
      ]}
      placeholder="Seleccionar bailarines"
      searchable
      value={value}
      onValueChange={setValue}
    />
  );
}

function getSelectedValues() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="dancerIds"]'),
  ).map((input) => input.value);
}

describe("MultiCombobox search", () => {
  test("clears the query and keeps every dancer picked", async () => {
    await renderer.renderAsync(<DancersPicker />);

    await updateReactDomForm(() => {
      document
        .querySelector<HTMLElement>('[data-slot="combobox-trigger"]')
        ?.click();
    });

    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Buscar"]',
    );

    await updateReactDomForm(() => {
      setInputValue(input as HTMLInputElement, "Bea");
    });

    expect(getReactDomTexts('[role="option"]')).toEqual(["Bea Lagos"]);

    await clickReactDomButton("Limpiar búsqueda");

    expect(input?.value).toBe("");
    expect(getReactDomTexts('[role="option"]')).toEqual([
      "Bea Lagos",
      "Camila Torres",
    ]);
    expect(getSelectedValues()).toEqual(["d1"]);
  });
});

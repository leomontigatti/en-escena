/** @vitest-environment jsdom */

import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SearchInput } from "./search-input";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function ControlledSearch() {
  const [value, setValue] = useState("");

  return (
    <SearchInput
      aria-label="Buscar bailarines"
      placeholder="Buscar por nombre"
      value={value}
      onValueChange={setValue}
    />
  );
}

function getInput() {
  const input = document.querySelector<HTMLInputElement>(
    'input[placeholder="Buscar por nombre"]',
  );

  if (!input) {
    throw new Error("Expected the search input to be rendered.");
  }

  return input;
}

function hasClearButton() {
  return document.querySelector("button")?.textContent === "Limpiar búsqueda";
}

describe("SearchInput", () => {
  test("offers the clear button only once there is a query, and clearing empties it", async () => {
    await renderer.renderAsync(<ControlledSearch />);

    expect(hasClearButton()).toBe(false);

    await updateReactDomForm(() => {
      setInputValue(getInput(), "Paz");
    });

    expect(hasClearButton()).toBe(true);

    await clickReactDomButton("Limpiar búsqueda");

    expect(getInput().value).toBe("");
    expect(hasClearButton()).toBe(false);
  });

  test("hides the clear button once the input is disabled, even with a query", async () => {
    await renderer.renderAsync(
      <SearchInput
        placeholder="Buscar por nombre"
        value="Paz"
        disabled
        onValueChange={() => {}}
      />,
    );

    expect(hasClearButton()).toBe(false);
  });

  test("clears through onClear when one is given", async () => {
    const onClear = vi.fn();
    const onValueChange = vi.fn();

    await renderer.renderAsync(
      <SearchInput
        placeholder="Buscar por nombre"
        value="Paz"
        onClear={onClear}
        onValueChange={onValueChange}
      />,
    );

    await clickReactDomButton("Limpiar búsqueda");

    expect(onClear).toHaveBeenCalledOnce();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { ChipBarPrototype } from "./chip-bar-prototype";
import { CommandPrototype } from "./command-prototype";
import { SheetPrototype } from "./sheet-prototype";
import {
  buildFilterSearch,
  createEmptyFilterValues,
  parseFilterValues,
} from "./filter-schema";
import { choreographyFilterFields } from "./sample-facets";

const renderer = createReactDomTestRenderer();
const emptyValues = createEmptyFilterValues(choreographyFilterFields);
const dayFilteredValues = { ...emptyValues, dia: "2026-05-02" };

describe("filter panel prototypes", () => {
  afterEach(() => {
    renderer.cleanup();
  });

  test("the chip bar names every field and the applied value", () => {
    renderer.render(
      <ChipBarPrototype
        fields={choreographyFilterFields}
        values={dayFilteredValues}
        onValuesChange={() => {}}
      />,
    );

    const markup = renderer.getContainer().innerHTML;

    expect(markup).toContain("Día");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("2 de mayo de 2026");
  });

  test("the command prototype offers to add a filter beside the applied one", () => {
    renderer.render(
      <CommandPrototype
        fields={choreographyFilterFields}
        values={dayFilteredValues}
        onValuesChange={() => {}}
      />,
    );

    const markup = renderer.getContainer().innerHTML;

    expect(markup).toContain("Añadir filtro");
    expect(markup).toContain("2 de mayo de 2026");
  });

  test("the sheet prototype counts the applied filters on its trigger", () => {
    renderer.render(
      <SheetPrototype
        fields={choreographyFilterFields}
        values={dayFilteredValues}
        onValuesChange={() => {}}
      />,
    );

    const markup = renderer.getContainer().innerHTML;

    expect(markup).toContain("Filtros");
    expect(markup).toContain("1");
  });
});

describe("filter schema", () => {
  test("keeps a known day and drops one that is not an option", () => {
    const known = parseFilterValues(
      choreographyFilterFields,
      new URLSearchParams("dia=2026-05-02"),
    );
    const unknown = parseFilterValues(
      choreographyFilterFields,
      new URLSearchParams("dia=2026-12-31"),
    );

    expect(known.dia).toBe("2026-05-02");
    expect(unknown.dia).toBeNull();
  });

  test("serializes applied filters and resets the page", () => {
    const search = buildFilterSearch(
      choreographyFilterFields,
      { ...dayFilteredValues, modalidad: "jazz" },
      "pagina=4&busqueda=luna",
    );

    expect(search).toContain("dia=2026-05-02");
    expect(search).toContain("modalidad=jazz");
    expect(search).toContain("busqueda=luna");
    expect(search).not.toContain("pagina");
  });

  test("drops a filter that is cleared", () => {
    const search = buildFilterSearch(choreographyFilterFields, emptyValues, "");

    expect(search).toBe("");
  });
});

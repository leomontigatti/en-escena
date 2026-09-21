/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { defaultClientDataTablePageSize } from "@/components/shared/data-table.shared";
import {
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { ProgramList } from "./list";
import type { ProgramListRow } from "./shared";

describe("the program list everyone outside the administration reads", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount({
    rows,
    showAcademy = true,
  }: {
    rows: ProgramListRow[];
    showAcademy?: boolean;
  }) {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/programa"]}>
        <ProgramList rows={rows} showAcademy={showAcademy} />
      </MemoryRouter>,
    );
  }

  function searchInput() {
    const input = document.querySelector("input[placeholder^='Buscar por']");

    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected the list's search box to be rendered.");
    }

    return input;
  }

  async function search(query: string) {
    await updateReactDomForm(() => {
      setInputValue(searchInput(), query);
    });
  }

  // The two placeholders promise the number, the name and the academy, and the
  // modality and the category are deliberately not facets on this surface.
  test("searches the number, the name and the academy and nothing else", async () => {
    await mount({
      rows: [
        buildRow({
          academyName: "Academia Sur",
          categoryName: "Infantil",
          choreographyId: "one",
          modalityName: "Jazz",
          name: "Primera",
          orderNumber: 1,
        }),
        buildRow({
          academyName: "Academia Norte",
          categoryName: "Juvenil",
          choreographyId: "two",
          modalityName: "Urbano",
          name: "Segunda",
          orderNumber: 2,
        }),
      ],
    });

    await search("Segunda");
    expect(document.body.textContent).not.toContain("Primera");
    expect(document.body.textContent).toContain("Segunda");

    await search("Academia Sur");
    expect(document.body.textContent).toContain("Primera");
    expect(document.body.textContent).not.toContain("Segunda");

    await search("Urbano");
    expect(document.body.textContent).toContain(
      "No hay presentaciones que coincidan con la búsqueda.",
    );

    await search("Juvenil");
    expect(document.body.textContent).toContain(
      "No hay presentaciones que coincidan con la búsqueda.",
    );
  });

  // The program hides the pagination, so a page size below the event's size
  // would drop the rest of the rows with nothing on screen to reach them.
  test("renders every row of an event larger than a default page", async () => {
    const rows = Array.from(
      { length: defaultClientDataTablePageSize * 2 + 3 },
      (_row, index) =>
        buildRow({
          choreographyId: `choreography-${index + 1}`,
          name: `Pieza ${index + 1}`,
          orderNumber: index + 1,
        }),
    );

    await mount({ rows });

    for (const row of rows) {
      expect(document.body.textContent).toContain(row.name);
    }
  });
});

function buildRow(overrides: Partial<ProgramListRow> = {}): ProgramListRow {
  return {
    academyName: "Academia Sur",
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    groupType: "solo",
    isBelowDeposit: false,
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

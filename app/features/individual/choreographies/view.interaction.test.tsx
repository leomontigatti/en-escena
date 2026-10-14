/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { IndividualChoreographiesView } from "@/features/individual/choreographies/view";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { IndividualChoreographyRow } from "./server";

describe("IndividualChoreographiesView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("a row's name opens how the individual takes part and each judge's score", async () => {
    await renderView([
      buildRow({
        name: "Viento Sur",
        result: {
          average: 87.5,
          award: "gold",
          disqualified: false,
          scores: [
            { judgeId: "judge_1", judgeName: "Laura Gómez", value: "88" },
            { judgeId: "judge_2", judgeName: "Pablo Ruiz", value: "87" },
          ],
        },
        roles: ["dancer", "professor"],
      }),
    ]);

    await openRow("Viento Sur");

    const dialog = getDialog();
    expect(dialog.textContent).toContain("Academia Demo · Bailarín y Profesor");
    expect(dialog.textContent).toContain("Medalla de oro");
    expect(dialog.textContent).toContain("87.5");
    expect(dialog.textContent).toContain("Laura Gómez");
    expect(dialog.textContent).toContain("88");
    expect(dialog.textContent).toContain("Pablo Ruiz");
  });

  test("an unpublished row's dialog says the result is not out yet", async () => {
    await renderView([buildRow({ name: "Brisa", result: null })]);

    await openRow("Brisa");

    const dialog = getDialog();
    expect(dialog.textContent).toContain("Academia Demo · Bailarín");
    expect(dialog.textContent).toContain("El resultado todavía no se publicó.");
  });

  async function renderView(choreographies: IndividualChoreographyRow[]) {
    await renderer.renderAsync(
      renderInDataRouter(
        "/particular/mis-coreografias",
        <IndividualChoreographiesView
          loaderData={{
            choreographies,
            hasActiveEvent: true,
            linkState: "linked",
          }}
        />,
      ),
    );
  }

  async function openRow(name: string) {
    const button = Array.from(
      document.querySelectorAll<HTMLButtonElement>("table button"),
    ).find((candidate) => candidate.textContent === name);

    if (!button) {
      throw new Error(`Expected a button named ${name} in the table.`);
    }

    await act(async () => {
      button.click();
    });
  }

  function getDialog() {
    const dialog = document.querySelector('[role="dialog"]');

    if (!dialog) {
      throw new Error("Expected the dialog to be open.");
    }

    return dialog;
  }
});

function buildRow(
  overrides: Partial<IndividualChoreographyRow>,
): IndividualChoreographyRow {
  return {
    academyName: "Academia Demo",
    categoryName: "Juvenil",
    choreographyId: `choreography_${overrides.name ?? "1"}`,
    groupType: "solo",
    modalityName: "Jazz",
    name: "Coreografía",
    result: null,
    roles: ["dancer"],
    submodalityName: "Lírico",
    ...overrides,
  };
}

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createReactDomTestRenderer,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";

import { lastOpenedPresentationStorageKey } from "./resume";
import { JudgePanelView } from "./view";

function buildRow(
  overrides: Partial<JudgePresentationRow> & { presentationId: string },
): JudgePresentationRow {
  return {
    categoryAdmitsExperienceLevels: true,
    categoryName: "Juvenil",
    criteria: [],
    experienceLevel: "amateur",
    groupType: "solo",
    judgeAssignmentId: `assignment-${overrides.presentationId}`,
    modalityName: "Jazz",
    name: `Coreografía ${overrides.presentationId}`,
    orderNumber: 1,
    status: "pendiente",
    submodalityName: "Lyrical",
    ...overrides,
    presentationId: overrides.presentationId,
  };
}

const presentations = [
  buildRow({
    name: "Primera",
    orderNumber: 1,
    presentationId: "a",
    status: "completa",
  }),
  buildRow({ name: "Segunda", orderNumber: 2, presentationId: "b" }),
  buildRow({ name: "Tercera", orderNumber: 3, presentationId: "c" }),
];

describe("the judge's list of today's presentations", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(renderer.cleanup);

  async function mount() {
    const router = createMemoryRouter(
      [
        {
          path: "/juzgamiento",
          element: (
            <JudgePanelView
              loaderData={{
                account: {
                  name: "Ana Juez",
                  roleLabel: "Jurado",
                  username: "ana.juez",
                },
                presentations,
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/juzgamiento"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function rowNames() {
    return [...document.querySelectorAll("tbody tr")].map((row) =>
      row.getAttribute("data-presentation-name"),
    );
  }

  test("hides what the judge already scored behind `Solo pendientes`", async () => {
    await mount();

    expect(rowNames()).toEqual(["Primera", "Segunda", "Tercera"]);

    const onlyPending = document.querySelector<HTMLButtonElement>(
      '[aria-label="Solo pendientes"]',
    );

    await updateReactDomForm(() => {
      onlyPending?.click();
    });

    expect(rowNames()).toEqual(["Segunda", "Tercera"]);
  });

  test("marks the first pending presentation when none was opened yet", async () => {
    await mount();

    expect(
      document
        .querySelector("[data-resume-marker]")
        ?.getAttribute("data-presentation-name"),
    ).toBe("Segunda");
  });

  test("marks the pending presentation after the last one opened", async () => {
    window.sessionStorage.setItem(lastOpenedPresentationStorageKey, "b");

    await mount();

    expect(
      document
        .querySelector("[data-resume-marker]")
        ?.getAttribute("data-presentation-name"),
    ).toBe("Tercera");
  });
});

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { JudgeAssignmentDialog } from "./judge-dialogs";
import { PresentationsListView } from "./view";
import type { PresentationListItem, PresentationListResult } from "./shared";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const ana = { id: "judge-ana", name: "Ana Juez" };
const bruno = { id: "judge-bruno", name: "Bruno Juez" };

describe("the bulk judge dialogs", () => {
  const renderer = createReactDomTestRenderer();
  afterEach(renderer.cleanup);

  async function mount() {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentacion",
          action: async () => null,
          element: <PresentationsListView loaderData={buildLoaderData()} />,
        },
      ],
      { initialEntries: ["/administracion/presentacion"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function rowCheckboxes() {
    return [
      ...document.querySelectorAll('button[aria-label="Seleccionar fila"]'),
    ] as HTMLButtonElement[];
  }

  test("leaves an unnumbered row unselectable", async () => {
    await mount();

    const [numbered, unnumbered] = rowCheckboxes();

    expect(numbered.disabled).toBe(false);
    expect(unnumbered.disabled).toBe(true);
  });

  test("names the selection, carries its rows and waits for a pick", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentacion",
          action: async () => null,
          element: (
            <JudgeAssignmentDialog
              assignableJudges={[ana, bruno]}
              assignedJudges={[ana]}
              mode="remove"
              open
              onOpenChange={() => {}}
              selectedRows={[buildItem({ assignedJudgeIds: [ana.id] })]}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentacion"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(document.body.textContent).toContain("Quitar jueces");
    expect(document.body.textContent).toContain("1 presentación elegida.");
    expect(
      [...document.querySelectorAll('input[name="coreografia"]')].map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["choreography-1"]);

    const submit = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Quitar",
    );

    // Nothing picked yet, so there is no removal to confirm.
    expect(submit?.disabled).toBe(true);
  });
});

function buildItem(
  overrides: Partial<PresentationListItem> = {},
): PresentationListItem {
  return {
    academyName: "Academia Sur",
    assignedJudgeIds: [],
    categoryName: "Infantil",
    choreographyNumber: 1,
    financialStatus: "paidInFull",
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    warnings: [],
    ...overrides,
  };
}

function buildLoaderData(): PresentationListResult {
  return {
    assignableJudges: [ana, bruno],
    assignedJudges: [ana],
    canOrder: true,
    days: ["2026-05-01"],
    filters: {
      day: null,
      order: { columnId: "orden", direction: "asc" },
      page: 1,
      query: "",
      warnings: null,
    },
    hasAnyRow: true,
    hasPresentations: true,
    presentations: [
      buildItem({ assignedJudgeIds: [ana.id] }),
      buildItem({
        choreographyNumber: 2,
        id: "choreography-2",
        name: "Segunda",
        orderNumber: null,
      }),
    ],
    presentationCount: 1,
    selectedEventId: "event-1",
    totalCount: 2,
    totalPages: 1,
    unorderedCount: 1,
    warnedCount: 0,
  };
}

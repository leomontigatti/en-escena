/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  waitFor,
} from "@/lib/test-support/react-dom";
import {
  addTableFilter,
  removeTableFilter,
} from "@/lib/test-support/data-table-filters";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";

import { lastOpenedPresentationStorageKey } from "./resume";
import type { JudgePanelRouteData } from "./server";
import { JudgePanelView } from "./view";

function buildRow(
  overrides: Partial<JudgePresentationRow> & { presentationId: string },
): JudgePresentationRow {
  return {
    academyName: "Academia Sur",
    experienceLevelRequirement: "required",
    categoryName: "Juvenil",
    criteria: [],
    criteriaValues: {},
    experienceLevel: "amateur",
    feedbackAudioUrl: null,
    groupType: "solo",
    judgeAssignmentId: `assignment-${overrides.presentationId}`,
    modalityName: "Jazz",
    name: `Coreografía ${overrides.presentationId}`,
    orderNumber: 1,
    status: "pending",
    submodalityName: "Lyrical",
    value: null,
    withdrawn: false,
    professionalEvaluation: false,
    ...overrides,
    presentationId: overrides.presentationId,
  };
}

const criteria: JudgePresentationRow["criteria"] = [
  {
    experienceLevel: null,
    id: "tecnica",
    kind: "adds",
    maximum: 100,
    name: "Técnica",
  },
];

const presentations = [
  buildRow({
    name: "Primera",
    orderNumber: 1,
    presentationId: "a",
    status: "complete",
    value: "87.5",
  }),
  buildRow({ name: "Segunda", orderNumber: 2, presentationId: "b" }),
  buildRow({ name: "Tercera", orderNumber: 3, presentationId: "c" }),
  buildRow({
    name: "Cuarta",
    orderNumber: 4,
    presentationId: "d",
    status: "noFeedback",
    value: "80.0",
  }),
  buildRow({
    name: "Quinta",
    orderNumber: 5,
    presentationId: "e",
    status: "disqualified",
    value: "90.0",
  }),
];

const judgingDate = "2026-08-22";
const pastDay = "2026-08-21";

const openDay = {
  day: judgingDate,
  dayOptions: [pastDay, judgingDate],
  isOpen: true,
} satisfies Partial<JudgePanelRouteData>;

const closedDay = {
  day: pastDay,
  dayOptions: [pastDay, judgingDate],
  isOpen: false,
} satisfies Partial<JudgePanelRouteData>;

describe("the judge's list of one day's presentations", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    renderer.cleanup();
  });

  async function mount(
    day: Pick<JudgePanelRouteData, "day" | "dayOptions" | "isOpen"> = openDay,
    url = "/juzgamiento",
    rows = presentations,
    finalistPicks: JudgePanelRouteData["finalistPicks"] = [],
  ) {
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
                finalistPicks,
                judgingDate,
                presentations: rows,
                ...day,
              }}
            />
          ),
        },
      ],
      { initialEntries: [url] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  function markedRowName() {
    return document
      .querySelector("[data-resume-marker]")
      ?.getAttribute("data-presentation-name");
  }

  /** The names of the rows scrolled into view, in order. */
  function spyOnScrolls() {
    const scrolledTo: (string | null)[] = [];

    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element,
    ) {
      scrolledTo.push(this.getAttribute("data-presentation-name"));
    });

    return scrolledTo;
  }

  async function openPresentationLink(name: string) {
    const link = [...document.querySelectorAll("tbody a")].find(
      (candidate) => candidate.textContent === name,
    );

    if (!link) {
      throw new Error(`Expected a link to "${name}".`);
    }

    await act(async () => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
  }

  function rowNames() {
    return [...document.querySelectorAll("tbody tr")].map((row) =>
      row.getAttribute("data-presentation-name"),
    );
  }

  test("hides what the judge already scored behind the `Estado` filter, with no other day to pick", async () => {
    await mount({ day: judgingDate, dayOptions: [], isOpen: true });

    expect(rowNames()).toEqual([
      "Primera",
      "Segunda",
      "Tercera",
      "Cuarta",
      "Quinta",
    ]);

    await addTableFilter("Estado", "Pendientes");

    expect(rowNames()).toEqual(["Segunda", "Tercera"]);

    await removeTableFilter("Estado");

    expect(rowNames()).toHaveLength(5);
  });

  test("shows every presentation of a day longer than a page of the table", async () => {
    const longDay = Array.from({ length: 36 }, (_, index) =>
      buildRow({
        orderNumber: index + 1,
        presentationId: `long-${index + 1}`,
      }),
    );

    await mount(openDay, "/juzgamiento", longDay);

    expect(rowNames()).toHaveLength(36);
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

  test.each([
    ["the dialog", [], "Cancelar"],
    ["the sheet", criteria, "Volver"],
  ])(
    "marks and scrolls to the next pending presentation on leaving %s",
    async (_form, rowCriteria, closeLabel) => {
      await mount(
        openDay,
        "/juzgamiento",
        presentations.map((row) => ({ ...row, criteria: rowCriteria })),
      );
      const scrolledTo = spyOnScrolls();

      await openPresentationLink("Segunda");
      await waitFor(() => findButton(closeLabel) !== undefined);
      await clickReactDomButton(closeLabel);
      await waitFor(() => findButton(closeLabel) === undefined);

      expect(markedRowName()).toBe("Tercera");
      expect(scrolledTo.at(-1)).toBe("Tercera");
    },
  );

  test("resumes after a presentation opened through its URL", async () => {
    await mount(openDay, "/juzgamiento?presentacion=b");
    await clickReactDomButton("Cancelar");
    await waitFor(() => findButton("Cancelar") === undefined);

    expect(markedRowName()).toBe("Tercera");
  });

  test("switches to another of the judge's days through the URL", async () => {
    const router = await mount();

    await addTableFilter("Día", "Viernes 21 de agosto");

    expect(router.state.location.search).toBe(`?dia=${pastDay}`);
  });

  test("goes back to the judging day when the day filter is removed", async () => {
    const router = await mount(
      closedDay,
      `/juzgamiento?dia=${pastDay}&presentacion=b`,
    );

    await removeTableFilter("Día");

    expect(router.state.location.search).toBe("");
  });

  test.each([
    [openDay, true],
    [closedDay, false],
  ])(
    "opens a `?presentacion=` URL only on the open day (%#)",
    async (day, opens) => {
      await mount(day, `/juzgamiento?dia=${day.day}&presentacion=b`);

      expect(document.querySelector('[role="dialog"]') !== null).toBe(opens);
    },
  );

  test.each([
    [openDay, true],
    [closedDay, false],
  ])(
    "offers the `Gran final` pick of each modality that dances on the day, to change only on the open day (%#)",
    async (day, editable) => {
      await mount(day, "/juzgamiento", presentations, [
        {
          academyId: "pirueta",
          academyName: "Academia Pirueta",
          modalityId: "jazz",
          modalityName: "Jazz",
          options: [
            { academyId: "pirueta", name: "Academia Pirueta" },
            { academyId: "vecina", name: "Academia Vecina" },
          ],
        },
      ]);

      expect(
        document.querySelector('[data-slot="select-trigger"]') !== null,
      ).toBe(editable);
      expect(
        document.querySelector<HTMLInputElement>("input[disabled]")?.value,
      ).toBe(editable ? undefined : "Academia Pirueta");
    },
  );

  // A withdrawn presentation stays on the list at its number, but nothing on
  // it can be scored: no link, no form from its URL, and no pending row.
  test("lists a withdrawn presentation without a way into its form, and not as pending", async () => {
    const withWithdrawn = [
      ...presentations,
      buildRow({
        name: "Sexta",
        orderNumber: 6,
        presentationId: "f",
        withdrawn: true,
      }),
    ];

    await mount(openDay, "/juzgamiento?presentacion=f", withWithdrawn);

    expect(rowNames()).toContain("Sexta");
    expect(
      [...document.querySelectorAll("tbody a")].map((link) => link.textContent),
    ).not.toContain("Sexta");
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await addTableFilter("Estado", "Pendientes");

    expect(rowNames()).toEqual(["Segunda", "Tercera"]);
  });

  test("leaves the `Gran final` out on a day no modality dances", async () => {
    await mount();

    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(document.querySelector("input[disabled]")).toBeNull();
  });
});

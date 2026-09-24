/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

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

/** What the route's action received, which is what the dialog really submits. */
type Submission = {
  choreographyIds: string[];
  intent: string;
  judgeIds: string[];
};

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

  test("names the selection and refuses to submit without a judge", async () => {
    const { submissions } = await renderDialog({
      mode: "remove",
      selectedRows: [buildItem({ assignedJudgeIds: [ana.id] })],
    });

    expect(document.body.textContent).toContain("Quitar jueces");
    expect(document.body.textContent).toContain("1 presentación elegida.");

    await clickReactDomButton("Quitar");
    await flush();

    // The emptiness is the form's to report, inline, rather than a button the
    // reader finds disabled with nothing said.
    expect(document.body.textContent).toContain("Este campo es obligatorio.");
    expect(submissions).toEqual([]);
  });

  test("offers every assignable judge when assigning, not only the assigned ones", async () => {
    await renderDialog({
      mode: "assign",
      selectedRows: [
        buildItem({ assignedJudgeIds: [ana.id] }),
        buildItem({ choreographyNumber: 2, id: "choreography-2" }),
      ],
    });

    expect(document.body.textContent).toContain("Asignar jueces");
    expect(document.body.textContent).toContain("2 presentaciones elegidas.");

    await clickReactDomButton("Elegí uno o más jueces");

    // Assigning needs no prior relation, so Bruno is on offer even though
    // nobody in the selection has him.
    const options = [...document.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    );

    expect(options).toContain(ana.name);
    expect(options).toContain(bruno.name);
  });

  test("offers only the judges the selection actually has when removing", async () => {
    await renderDialog({
      mode: "remove",
      selectedRows: [buildItem({ assignedJudgeIds: [ana.id] })],
    });

    await clickReactDomButton("Elegí uno o más jueces");

    const options = [...document.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent,
    );

    expect(options).toEqual([ana.name]);
  });

  test("submits the chosen judges with the rows the selection carries", async () => {
    const { submissions } = await renderDialog({
      mode: "assign",
      selectedRows: [
        buildItem(),
        buildItem({ choreographyNumber: 2, id: "choreography-2" }),
      ],
    });

    await pickJudge(bruno.name);
    await clickReactDomButton("Asignar");
    await flush();

    expect(submissions).toEqual([
      {
        choreographyIds: ["choreography-1", "choreography-2"],
        intent: "assign-judges",
        judgeIds: [bruno.id],
      },
    ]);
  });

  test("submits the removal under its own intent", async () => {
    const { submissions } = await renderDialog({
      mode: "remove",
      selectedRows: [buildItem({ assignedJudgeIds: [ana.id] })],
    });

    await pickJudge(ana.name);
    await clickReactDomButton("Quitar");
    await flush();

    expect(submissions).toEqual([
      {
        choreographyIds: ["choreography-1"],
        intent: "remove-judges",
        judgeIds: [ana.id],
      },
    ]);
  });

  test("closes itself once the assignment succeeds", async () => {
    const onOpenChange = vi.fn();
    await renderDialog(
      {
        mode: "assign",
        onOpenChange,
        selectedRows: [buildItem()],
      },
      () => ({
        message: "Se asignó 1 juez a 1 presentación.",
        status: "success",
      }),
    );

    await pickJudge(ana.name);
    await clickReactDomButton("Asignar");
    await flush();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  async function pickJudge(name: string) {
    await clickReactDomButton("Elegí uno o más jueces");

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (candidate) => candidate.textContent === name,
    );

    if (!(option instanceof HTMLElement)) {
      throw new Error(`Expected "${name}" to be on offer.`);
    }

    await act(async () => {
      option.click();
      await Promise.resolve();
    });
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function renderDialog(
    props: Partial<ComponentProps<typeof JudgeAssignmentDialog>>,
    actionResult: () => unknown = () => null,
  ) {
    const submissions: Submission[] = [];
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentacion",
          action: async ({ request }) => {
            const formData = await request.formData();

            submissions.push({
              choreographyIds: formData.getAll("coreografia").map(String),
              intent: String(formData.get("intent") ?? ""),
              judgeIds: formData.getAll("juez").map(String),
            });

            return actionResult();
          },
          element: (
            <JudgeAssignmentDialog
              assignableJudges={[ana, bruno]}
              assignedJudges={[ana]}
              mode="assign"
              open
              onOpenChange={() => {}}
              selectedRows={[buildItem()]}
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentacion"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return { submissions };
  }
});

function buildItem(
  overrides: Partial<PresentationListItem> = {},
): PresentationListItem {
  return {
    academyName: "Academia Sur",
    assignedJudgeIds: [],
    categoryName: "Infantil",
    choreographyNumber: 1,
    evaluationStatus: "pending",
    experienceLevel: null,
    financialStatus: "paidInFull",
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    presentationId: "presentation-1",
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

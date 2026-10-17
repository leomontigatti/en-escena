/** @vitest-environment jsdom */

import { act, useState, type ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  getButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { JudgeEditDialog } from "./judge-dialogs";
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
const carla = { id: "judge-carla", name: "Carla Juez" };

/** What the route's action received, which is what the dialog really submits. */
type Submission = {
  choreographyIds: string[];
  intent: string;
  toAdd: string[];
  toRemove: string[];
};

describe("the bulk judge dialog", () => {
  const renderer = createReactDomTestRenderer();
  afterEach(renderer.cleanup);

  async function mount() {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          action: async () => null,
          element: <PresentationsListView loaderData={buildLoaderData()} />,
        },
      ],
      { initialEntries: ["/administracion/presentaciones"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function rowCheckboxes() {
    return [
      ...document.querySelectorAll('button[aria-label="Seleccionar fila"]'),
    ] as HTMLButtonElement[];
  }

  // Ana is on both rows, Bruno on one of them, Carla on neither.
  const twoRows = [
    buildItem({ assignedJudgeIds: [ana.id, bruno.id] }),
    buildItem({
      assignedJudgeIds: [ana.id],
      choreographyNumber: 2,
      id: "choreography-2",
    }),
  ];

  test("leaves an unnumbered row unselectable", async () => {
    await mount();

    const [numbered, unnumbered] = rowCheckboxes();

    expect(numbered.disabled).toBe(false);
    expect(unnumbered.disabled).toBe(true);
  });

  test("starts each judge where it stands across the chosen rows", async () => {
    await renderDialog({ selectedRows: twoRows });

    expect(document.body.textContent).toContain("2 presentaciones elegidas.");
    expect(judgeStates()).toEqual({
      [ana.name]: "true",
      [bruno.name]: "mixed",
      [carla.name]: "false",
    });
    expect(getButton("Guardar").disabled).toBe(true);
  });

  // The server adds no suspended judge, so the dialog never offers to: one on
  // some of the rows goes from mixed to off and back, never to checked, and
  // off is a removal.
  test("only takes a judge that is no longer assignable off the rows", async () => {
    const { submissions } = await renderDialog({
      assignableJudges: [carla],
      assignedJudges: [ana, bruno],
      selectedRows: twoRows,
    });

    await pickJudge(bruno.name);
    expect(judgeStates()[bruno.name]).toBe("false");

    await pickJudge(bruno.name);
    expect(judgeStates()[bruno.name]).toBe("mixed");

    await pickJudge(bruno.name);
    await clickReactDomButton("Guardar");
    await flush();

    expect(submissions).toEqual([
      {
        choreographyIds: ["choreography-1", "choreography-2"],
        intent: "edit-judges",
        toAdd: [],
        toRemove: [bruno.id],
      },
    ]);
  });

  test("submits what changed, and leaves an untouched mixed judge out", async () => {
    const { submissions } = await renderDialog({ selectedRows: twoRows });

    await pickJudge(carla.name);
    await pickJudge(ana.name);
    await clickReactDomButton("Guardar");
    await flush();

    expect(submissions).toEqual([
      {
        choreographyIds: ["choreography-1", "choreography-2"],
        intent: "edit-judges",
        toAdd: [carla.id],
        toRemove: [ana.id],
      },
    ]);
  });

  test("takes a mixed judge onto every row, off every row, then back as it was", async () => {
    await renderDialog({ selectedRows: twoRows });

    await pickJudge(bruno.name);
    expect(judgeStates()[bruno.name]).toBe("true");
    expect(getButton("Guardar").disabled).toBe(false);

    await pickJudge(bruno.name);
    expect(judgeStates()[bruno.name]).toBe("false");

    await pickJudge(bruno.name);
    expect(judgeStates()[bruno.name]).toBe("mixed");
    expect(getButton("Guardar").disabled).toBe(true);
  });

  test("closes itself once the edit succeeds", async () => {
    await renderDialog({ selectedRows: [buildItem()] }, () => ({
      message: "Se asignó 1 juez a 1 presentación.",
      status: "success",
    }));

    await pickJudge(ana.name);
    await clickReactDomButton("Guardar");
    await flush();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // Picks not yet saved are lost on closing, so `Cancelar` asks first; with
  // nothing changed it just closes.
  test("asks before dropping changes, and closes at once without any", async () => {
    await renderDialog({ selectedRows: [buildItem()] });

    await pickJudge(ana.name);
    await clickReactDomButton("Cancelar");

    expect(document.body.textContent).toContain("¿Descartar los cambios?");

    renderer.cleanup();
    await renderDialog({ selectedRows: [buildItem()] });
    await clickReactDomButton("Cancelar");

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  /** The judges the dialog's checklist offers, one row each. */
  function judgeRows() {
    return [
      ...document.querySelectorAll<HTMLElement>('[data-slot="choice-card"]'),
    ];
  }

  /** Each offered judge's checkbox, by name, as `aria-checked` reads it. */
  function judgeStates() {
    return Object.fromEntries(
      judgeRows().map((row) => [
        row.textContent,
        row.querySelector('[role="checkbox"]')?.getAttribute("aria-checked"),
      ]),
    );
  }

  async function pickJudge(name: string) {
    const option = judgeRows().find(
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
    props: Partial<ComponentProps<typeof JudgeEditDialog>>,
    actionResult: () => unknown = () => null,
  ) {
    const submissions: Submission[] = [];
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          action: async ({ request }) => {
            const formData = await request.formData();

            submissions.push({
              choreographyIds: formData.getAll("coreografia").map(String),
              intent: String(formData.get("intent") ?? ""),
              toAdd: formData.getAll("agregar").map(String),
              toRemove: formData.getAll("quitar").map(String),
            });

            return actionResult();
          },
          element: <ClosableDialog {...props} />,
        },
      ],
      { initialEntries: ["/administracion/presentaciones"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return { submissions };
  }
});

/** The dialog as the list holds it: closing it unmounts it. */
function ClosableDialog(
  props: Partial<ComponentProps<typeof JudgeEditDialog>>,
) {
  const [open, setOpen] = useState(true);

  return open ? (
    <JudgeEditDialog
      assignableJudges={[ana, bruno, carla]}
      assignedJudges={[ana, bruno]}
      open
      onOpenChange={setOpen}
      selectedRows={[buildItem()]}
      {...props}
    />
  ) : null;
}

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
    experienceLevelRequirement: "notApplicable",
    financialStatus: "paidInFull",
    frozen: false,
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    presentationId: "presentation-1",
    professionalEvaluation: false,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    warnings: [],
    withdrawn: false,
    ...overrides,
  };
}

function buildLoaderData(): PresentationListResult {
  return {
    assignableJudges: [ana, bruno],
    assignedJudges: [ana],
    canWrite: true,
    dayRowCount: 1,
    days: ["2026-05-01"],
    filters: {
      day: null,
      evaluation: null,
      order: { columnId: "orden", direction: "asc" },
      query: "",
      status: null,
    },
    frozenDays: [],
    hasAnyRow: true,
    hasOrderableRow: true,
    orderableDays: [],
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
    highestOrderNumber: 1,
    musicDownloadDays: [],
    programExportDays: [],
    programVisibleDays: [],
    selectedEventId: "event-1",
    unorderedCount: 1,
    warnedCount: 0,
  };
}

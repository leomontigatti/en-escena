/** @vitest-environment jsdom */

import {
  createMemoryRouter,
  RouterProvider,
  useActionData,
} from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { JudgePanelView } from "@/features/judging/list/view";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { discardChangesTitle } from "@/lib/shared/discard-guard";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import type { JudgePanelActionData } from "./action.server";

const criteria = [
  { id: "tecnica", kind: "adds" as const, maximum: 60, name: "Técnica" },
  {
    id: "interpretacion",
    kind: "adds" as const,
    maximum: 40,
    name: "Interpretación",
  },
  {
    id: "penalizacion",
    kind: "deducts" as const,
    maximum: 20,
    name: "Penalización",
  },
];

function buildRow(
  overrides: Partial<JudgePresentationRow> & { presentationId: string },
): JudgePresentationRow {
  return {
    categoryAdmitsExperienceLevels: true,
    categoryName: "Juvenil",
    criteria: [],
    criteriaValues: {},
    experienceLevel: "amateur",
    feedbackAudioUrl: null,
    groupType: "solo",
    judgeAssignmentId: `assignment-${overrides.presentationId}`,
    modalityName: "Acrobacia",
    name: `Coreografía ${overrides.presentationId}`,
    orderNumber: 1,
    status: "pending",
    submodalityName: "Acrobática",
    value: null,
    ...overrides,
    presentationId: overrides.presentationId,
  };
}

const presentations = [
  buildRow({ criteria, name: "Primera", orderNumber: 1, presentationId: "a" }),
  buildRow({ criteria, name: "Segunda", orderNumber: 2, presentationId: "b" }),
];

describe("scoring a submodality with criteria", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    window.sessionStorage.clear();
    submitted.length = 0;
  });

  afterEach(renderer.cleanup);

  async function mount(options: {
    actionData?: JudgePanelActionData;
    presentationId: string;
    rows?: JudgePresentationRow[];
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/juzgamiento",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return { message: "Guardaste el puntaje.", status: "success" };
          },
          element: (
            <JudgePanelView
              actionData={options.actionData}
              loaderData={{
                account: {
                  name: "Ana Juez",
                  roleLabel: "Jurado",
                  username: "ana.juez",
                },
                presentations: options.rows ?? presentations,
              }}
            />
          ),
        },
      ],
      {
        initialEntries: [`/juzgamiento?presentacion=${options.presentationId}`],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  function criterionInput(criterionId: string) {
    return document.querySelector<HTMLInputElement>(`#criterio-${criterionId}`);
  }

  function total() {
    return document.querySelector("[data-sheet-total]")?.textContent;
  }

  function errorMessages() {
    return [...document.querySelectorAll("[data-slot='field-error']")].map(
      (node) => node.textContent,
    );
  }

  function saveButton() {
    return document.querySelector<HTMLButtonElement>(
      "button[form='judge-sheet-form']",
    );
  }

  async function type(criterionId: string, value: string) {
    const input = criterionInput(criterionId);

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, value);
      }
    });
  }

  test("opens a full page with one field per criterion, deductions starting at 0", async () => {
    await mount({ presentationId: "a" });

    expect(document.body.textContent).toContain("Técnica");
    expect(criterionInput("tecnica")?.value).toBe("");
    expect(criterionInput("penalizacion")?.value).toBe("0");
    // The list is gone: the sheet is the page, not something over it.
    expect(document.body.textContent).not.toContain("Solo pendientes");
  });

  test("reopens a saved sheet on the judge's own lines, and leaves it clean", async () => {
    const router = await mount({
      presentationId: "a",
      rows: [
        buildRow({
          criteria,
          criteriaValues: {
            interpretacion: "30.0",
            penalizacion: "2.5",
            tecnica: "50.5",
          },
          name: "Primera",
          presentationId: "a",
          status: "complete",
          value: "78.0",
        }),
      ],
    });

    expect(criterionInput("tecnica")?.value).toBe("50.5");
    expect(criterionInput("interpretacion")?.value).toBe("30");
    expect(criterionInput("penalizacion")?.value).toBe("2.5");
    expect(total()).toBe("78 / 100");

    // Nothing was touched, so there is nothing to lose and nothing to ask.
    await clickReactDomButton("Volver");

    expect(document.body.textContent).not.toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("");
  });

  test("saves a reopened sheet without retyping a line, so only the take changes", async () => {
    await mount({
      presentationId: "a",
      rows: [
        buildRow({
          criteria,
          criteriaValues: {
            interpretacion: "30.0",
            penalizacion: "0.0",
            tecnica: "50.0",
          },
          name: "Primera",
          presentationId: "a",
          status: "complete",
          value: "80.0",
        }),
      ],
    });

    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      {
        audioIntent: "keep",
        "criterio.interpretacion": "30",
        "criterio.penalizacion": "0",
        "criterio.tecnica": "50",
        intent: "save-score",
        presentationId: "a",
      },
    ]);
  });

  test("adds up what is typed, taking the deductions off and ignoring a half-typed value", async () => {
    await mount({ presentationId: "a" });

    expect(total()).toBe("0 / 100");

    await type("tecnica", "50");
    await type("interpretacion", "30.");

    expect(total()).toBe("50 / 100");

    await type("interpretacion", "30");
    await type("penalizacion", "2.5");

    expect(total()).toBe("77.5 / 100");
  });

  test("errors only once the judge saves, naming each criterion's own maximum", async () => {
    await mount({ presentationId: "a" });

    await type("penalizacion", "25");

    expect(errorMessages()).toEqual([]);

    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(errorMessages()).toEqual([
      scoreValueMessage(60),
      scoreValueMessage(40),
      scoreValueMessage(20),
    ]);
    expect(submitted).toEqual([]);
  });

  test("posts every criterion with the save intent", async () => {
    await mount({ presentationId: "a" });

    await type("tecnica", "50");
    await type("interpretacion", "30");

    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      {
        audioIntent: "keep",
        "criterio.interpretacion": "30",
        "criterio.penalizacion": "0",
        "criterio.tecnica": "50",
        intent: "save-score",
        presentationId: "a",
      },
    ]);
  });

  test("lets the save's own navigation through to the next presentation", async () => {
    const router = await mount({
      actionData: {
        intent: "save-score",
        message: "Guardaste el puntaje.",
        status: "success",
      },
      presentationId: "a",
    });

    expect(document.body.textContent).not.toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("?presentacion=b");
  });

  /**
   * The same panel, but reading the answer off the route the way the real one
   * does, so a test can put a refusal *after* the save rather than before it.
   */
  function PanelReadingItsAnswer({ rows }: { rows: JudgePresentationRow[] }) {
    return (
      <JudgePanelView
        actionData={useActionData() as JudgePanelActionData | undefined}
        loaderData={{
          account: {
            name: "Ana Juez",
            roleLabel: "Jurado",
            username: "ana.juez",
          },
          presentations: rows,
        }}
      />
    );
  }

  async function mountAnswering(answer: JudgePanelActionData) {
    const router = createMemoryRouter(
      [
        {
          path: "/juzgamiento",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return answer;
          },
          element: <PanelReadingItsAnswer rows={presentations} />,
        },
      ],
      { initialEntries: ["/juzgamiento?presentacion=a"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  test("still asks before throwing away a sheet whose save was refused", async () => {
    const router = await mountAnswering({
      intent: "save-score",
      message: "La jornada ya cerró, no se pueden guardar puntajes.",
      status: "error",
    });

    await type("tecnica", "50");
    await type("interpretacion", "40");
    await clickReactDomButton("Guardar");

    // The save was refused, so the judge is still looking at their sheet: the
    // pass it was let through on is spent and the guard has to be back.
    expect(router.state.location.search).toBe("?presentacion=a");
    expect(criterionInput("tecnica")?.value).toBe("50");

    await clickReactDomButton("Volver");

    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("?presentacion=a");
  });

  test("leaves a clean sheet without asking", async () => {
    const router = await mount({ presentationId: "a" });

    await clickReactDomButton("Volver");

    expect(document.body.textContent).not.toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("");
  });

  test("asks before throwing away a sheet that was filled in", async () => {
    const router = await mount({ presentationId: "a" });

    await type("tecnica", "50");
    await clickReactDomButton("Volver");

    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("?presentacion=a");

    await clickReactDomButton("Seguir editando");

    expect(document.body.textContent).not.toContain(discardChangesTitle);
    expect(criterionInput("tecnica")?.value).toBe("50");

    await clickReactDomButton("Volver");
    await clickReactDomButton("Descartar");

    expect(router.state.location.search).toBe("");
  });
});

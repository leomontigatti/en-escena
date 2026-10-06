/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, afterEach, describe, expect, test } from "vitest";

import { PresentationScoresView } from "@/features/admin/presentations/scores/view";
import type { PresentationScoresLoaderData } from "@/features/admin/presentations/scores/server";
import type {
  PresentationJudgeScore,
  PresentationScoresView as PresentationScores,
} from "@/lib/judging/presentation-scores.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import {
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

/**
 * What administration's own corrections post, and what they refuse before
 * posting anything. The panel is a page of separate decisions, so the two
 * things worth proving here are that a save carries one judge's work and only
 * theirs, and that a value the judge's own rule would refuse never leaves the
 * page.
 */
describe("correcting the panel's scores", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    submitted.length = 0;
  });

  afterEach(renderer.cleanup);

  async function mount(
    overrides: Partial<PresentationScores> = {},
    options: { canEdit?: boolean } = {},
  ) {
    const loaderData: PresentationScoresLoaderData = {
      canEdit: options.canEdit ?? true,
      presentation: buildPresentation(overrides),
    };
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones/presentation-1/puntajes",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return { message: "Guardaste el puntaje.", status: "success" };
          },
          element: <PresentationScoresView loaderData={loaderData} />,
        },
      ],
      {
        initialEntries: [
          "/administracion/presentaciones/presentation-1/puntajes",
        ],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  function input(id: string) {
    return document.querySelector<HTMLInputElement>(`#${id}`);
  }

  function errorMessages() {
    return [...document.querySelectorAll("[data-slot='field-error']")].map(
      (node) => node.textContent,
    );
  }

  function menuItems() {
    return [...document.querySelectorAll("[role='menuitem']")];
  }

  function menuItem(label: string) {
    return menuItems().find((item) => item.textContent?.trim() === label);
  }

  function metrics() {
    return Object.fromEntries(
      [...document.querySelectorAll("[data-slot='card']")]
        .filter((card) => card.querySelector("p"))
        .map((card) => [
          card.querySelector("[data-slot='card-title']")?.textContent,
          card.querySelector("p")?.textContent,
        ]),
    );
  }

  function dialogButton(label: string) {
    return [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[role='alertdialog'] button",
      ),
    ].find((button) => button.textContent?.trim() === label);
  }

  async function openActionsMenu() {
    const button = findButton("Acciones", { exact: true });

    if (!button) {
      throw new Error("Expected the actions menu button to be rendered.");
    }

    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    });
    Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

    await act(async () => {
      button.dispatchEvent(pointerDown);
      await Promise.resolve();
    });
  }

  function saveButtons() {
    return [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "Guardar",
    );
  }

  function discardButton() {
    return [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Descartar cambios",
    );
  }

  function sheetSums() {
    return [
      ...document.querySelectorAll("form legend, form [data-sheet-total]"),
    ].map((element) => element.textContent);
  }

  async function type(id: string, value: string) {
    const field = input(id);

    await updateReactDomForm(() => {
      if (field) {
        setInputValue(field, value);
      }
    });
  }

  test("keeps the choreography and the disqualification in the actions menu, asking before it disqualifies", async () => {
    await mount();
    await openActionsMenu();

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
      "Ver la coreografía",
      "Descalificar",
    ]);
    expect(menuItem("Ver la coreografía")?.getAttribute("href")).toBe(
      "/administracion/coreografias/choreography-1",
    );

    await act(async () => {
      (menuItem("Descalificar") as HTMLElement | undefined)?.click();
      await Promise.resolve();
    });

    expect(submitted).toEqual([]);
    expect(document.querySelector("[role='alertdialog'] h2")?.textContent).toBe(
      "¿Descalificar la presentación?",
    );

    await updateReactDomForm(() => {
      dialogButton("Descalificar")?.click();
    });

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      { intent: "disqualify" },
    ]);
  });

  test("offers a reader who may not edit only the way to the choreography", async () => {
    await mount({}, { canEdit: false });
    await openActionsMenu();

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
      "Ver la coreografía",
    ]);
  });

  test("offers to reinstate a disqualified presentation and says why it has no result", async () => {
    await mount({ average: null, disqualified: true, award: null });
    await openActionsMenu();

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
      "Ver la coreografía",
      "Volver a calificar",
    ]);
    expect(
      document.querySelector("[data-slot='alert-title']")?.textContent,
    ).toBe("Presentación descalificada");
    expect(metrics()).toEqual({ Premio: "No aplica", Promedio: "No aplica" });
  });

  test("opens every stored score on the number the judge gave", async () => {
    await mount({
      judges: [
        buildJudge({
          judgeName: "Ana Juez",
          scoreId: "score-1",
          value: "90.0",
        }),
        buildJudge({
          judgeAssignmentId: "assignment-2",
          judgeName: "Zulema Juez",
          scoreId: "score-2",
          value: "80.5",
        }),
      ],
    });

    expect(input("puntaje-score-1")?.value).toBe("90");
    expect(input("puntaje-score-2")?.value).toBe("80.5");
  });

  test("posts one judge's corrected score, and nothing of the other's", async () => {
    await mount({
      judges: [
        buildJudge({ scoreId: "score-1", value: "90.0" }),
        buildJudge({
          judgeAssignmentId: "assignment-2",
          judgeName: "Zulema Juez",
          scoreId: "score-2",
          value: "80.5",
        }),
      ],
    });

    await type("puntaje-score-1", "70.5");

    await updateReactDomForm(() => {
      saveButtons()[0]?.click();
    });

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      { intent: "edit-score", scoreId: "score-1", value: "70.5" },
    ]);
  });

  test("refuses a value the save would refuse, without posting it", async () => {
    await mount({ judges: [buildJudge({ scoreId: "score-1" })] });

    await type("puntaje-score-1", "90.2");

    await updateReactDomForm(() => {
      saveButtons()[0]?.click();
    });

    expect(errorMessages()).toEqual([scoreValueMessage()]);
    expect(submitted).toEqual([]);
  });

  test("posts a whole sheet as one save, each line named for its criterion", async () => {
    await mount({
      criteria: [
        {
          experienceLevel: null,
          id: "technique",
          kind: "adds",
          maximum: 100,
          name: "Técnica",
        },
        {
          experienceLevel: null,
          id: "falls",
          kind: "deducts",
          maximum: 10,
          name: "Caídas",
        },
      ],
      judges: [
        buildJudge({
          criteriaValues: { falls: "5.0", technique: "90.5" },
          scoreId: "score-1",
          value: "85.5",
        }),
      ],
    });

    expect(input("criterio-score-1-technique")?.value).toBe("90.5");
    expect(input("criterio-score-1-falls")?.value).toBe("5");

    await type("criterio-score-1-technique", "92");

    await updateReactDomForm(() => {
      saveButtons()[0]?.click();
    });

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      {
        "criterio.falls": "5",
        "criterio.technique": "92",
        intent: "edit-score",
        scoreId: "score-1",
      },
    ]);
  });

  test("splits the sheet by level and sums each part as a line is retyped", async () => {
    await mount({
      criteria: [
        {
          experienceLevel: null,
          id: "technique",
          kind: "adds",
          maximum: 60,
          name: "Técnica",
        },
        {
          experienceLevel: "amateur",
          id: "style",
          kind: "adds",
          maximum: 40,
          name: "Estilo",
        },
        {
          experienceLevel: null,
          id: "falls",
          kind: "deducts",
          maximum: 10,
          name: "Caídas",
        },
      ],
      judges: [
        buildJudge({
          criteriaValues: { falls: "5.0", style: "30.0", technique: "50.0" },
          scoreId: "score-1",
          value: "75.0",
        }),
      ],
    });

    await type("criterio-score-1-technique", "55.5");

    expect(sheetSums()).toEqual([
      "Devolución",
      "Evaluación general55.5 / 60",
      "Técnico obligatorio30 / 40",
      "Descuentan−5 / 10",
      "Total del jurado80.5 / 100",
    ]);
  });

  test("offers `Guardar` and `Descartar cambios` only once the sheet differs from what is saved", async () => {
    await mount({
      criteria: [
        {
          experienceLevel: null,
          id: "technique",
          kind: "adds",
          maximum: 100,
          name: "Técnica",
        },
      ],
      judges: [buildJudge({ criteriaValues: { technique: "90.0" } })],
    });

    expect(saveButtons()[0]?.disabled).toBe(true);
    expect(discardButton()).toBeUndefined();

    await type("criterio-score-1-technique", "80");

    expect(saveButtons()[0]?.disabled).toBe(false);

    await updateReactDomForm(() => {
      discardButton()?.click();
    });

    expect(input("criterio-score-1-technique")?.value).toBe("90");
    expect(saveButtons()[0]?.disabled).toBe(true);
    expect(discardButton()).toBeUndefined();
  });

  test("refuses a line over its own criterion's maximum", async () => {
    await mount({
      criteria: [
        {
          experienceLevel: null,
          id: "falls",
          kind: "deducts",
          maximum: 10,
          name: "Caídas",
        },
      ],
      judges: [
        buildJudge({
          criteriaValues: { falls: "5.0" },
          scoreId: "score-1",
          value: "95.0",
        }),
      ],
    });

    await type("criterio-score-1-falls", "25");

    await updateReactDomForm(() => {
      saveButtons()[0]?.click();
    });

    expect(errorMessages()).toEqual([scoreValueMessage(10)]);
    expect(submitted).toEqual([]);
  });
});

function buildJudge(
  overrides: Partial<PresentationJudgeScore> = {},
): PresentationJudgeScore {
  return {
    criteriaValues: {},
    feedbackAudioUrl: null,
    judgeAssignmentId: "assignment-1",
    judgeId: "judge-1",
    judgeName: "Ana Juez",
    scoreId: "score-1",
    value: "90.0",
    ...overrides,
  };
}

function buildPresentation(
  overrides: Partial<PresentationScores> = {},
): PresentationScores {
  return {
    academyName: "Academia Sur",
    average: 90,
    categoryName: "Juvenil",
    choreographyId: "choreography-1",
    criteria: [],
    disqualified: false,
    experienceLevel: "amateur",
    groupType: "solo",
    judges: [buildJudge()],
    award: "gold",
    modalityName: "Danza clásica",
    name: "Primera",
    orderNumber: 1,
    presentationId: "presentation-1",
    professionalEvaluation: false,
    submodalityName: "Acrobacia",
    ...overrides,
  };
}

/** @vitest-environment jsdom */

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

  async function mount(overrides: Partial<PresentationScores> = {}) {
    const loaderData: PresentationScoresLoaderData = {
      canEdit: true,
      presentation: buildPresentation(overrides),
    };
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentacion/presentation-1/puntajes",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return { message: "Guardaste el puntaje.", status: "success" };
          },
          element: <PresentationScoresView loaderData={loaderData} />,
        },
      ],
      {
        initialEntries: [
          "/administracion/presentacion/presentation-1/puntajes",
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

  function saveButtons() {
    return [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "Guardar",
    );
  }

  async function type(id: string, value: string) {
    const field = input(id);

    await updateReactDomForm(() => {
      if (field) {
        setInputValue(field, value);
      }
    });
  }

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
        { id: "technique", kind: "adds", maximum: 100, name: "Técnica" },
        { id: "falls", kind: "deducts", maximum: 10, name: "Caídas" },
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

  test("refuses a line over its own criterion's maximum", async () => {
    await mount({
      criteria: [{ id: "falls", kind: "deducts", maximum: 10, name: "Caídas" }],
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
    annulled: false,
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
    judges: [buildJudge()],
    medal: "gold",
    modalityName: "Danza clásica",
    name: "Primera",
    orderNumber: 1,
    presentationId: "presentation-1",
    submodalityName: "Acrobacia",
    ...overrides,
  };
}

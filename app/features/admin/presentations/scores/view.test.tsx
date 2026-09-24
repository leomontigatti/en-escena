import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PresentationScoresView } from "@/features/admin/presentations/scores/view";
import type { PresentationScoresLoaderData } from "@/features/admin/presentations/scores/server";
import type {
  PresentationJudgeScore,
  PresentationScoresView as PresentationScores,
} from "@/lib/judging/presentation-scores.server";

describe("PresentationScoresView", () => {
  test("shows a row per judge, with the panel's average and medal", () => {
    const markup = renderView({
      average: 85,
      judges: [
        buildJudge({ judgeName: "Ana Juez", value: "90.0" }),
        buildJudge({ judgeName: "Zulema Juez", value: "80.5" }),
      ],
      medal: "plata",
    });

    expect(markup).toContain("Ana Juez");
    expect(markup).toContain("Zulema Juez");
    expect(markup).toContain(">90<");
    expect(markup).toContain(">80.5<");
    expect(markup).toContain("85");
    expect(markup).toContain("Medalla de plata");
  });

  test("names a judge who has not saved anything yet", () => {
    const markup = renderView({
      average: null,
      judges: [buildJudge({ judgeName: "Ana Juez", value: null })],
      medal: null,
    });

    expect(markup).toContain("Sin puntaje");
    expect(markup).toContain("Sin devolución");
  });

  test("marks an annulled score as out of the average", () => {
    const markup = renderView({
      judges: [buildJudge({ annulled: true, value: "10.0" })],
    });

    expect(markup).toContain("Anulado");
  });

  test("says a disqualified presentation has no average", () => {
    const markup = renderView({
      average: null,
      disqualified: true,
      medal: null,
    });

    expect(markup).toContain("Descalificada");
    expect(markup).toContain(
      "Una presentación descalificada queda fuera de los resultados.",
    );
  });

  test("links to the choreography", () => {
    const markup = renderView({ choreographyId: "choreography-7" });

    expect(markup).toContain(
      'href="/administracion/coreografias/choreography-7"',
    );
  });

  test("shows a tab per judge with their sheet when there are criteria", () => {
    const markup = renderView({
      criteria: [
        { id: "technique", kind: "adds", maximum: 100, name: "Técnica" },
        { id: "falls", kind: "deducts", maximum: 10, name: "Caídas" },
      ],
      judges: [
        buildJudge({
          criteriaValues: { falls: "5.0", technique: "90.5" },
          judgeName: "Ana Juez",
          value: "85.5",
        }),
      ],
    });

    expect(markup).toContain("Técnica");
    expect(markup).toContain("Caídas");
    expect(markup).toContain(">90.5<");
    expect(markup).toContain("/ 100");
    expect(markup).toContain("/ 10");
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

function renderView(overrides: Partial<PresentationScores> = {}) {
  const loaderData: PresentationScoresLoaderData = {
    canEdit: true,
    presentation: {
      academyName: "Academia Sur",
      average: 90,
      categoryName: "Juvenil",
      choreographyId: "choreography-1",
      criteria: [],
      disqualified: false,
      experienceLevel: "amateur",
      judges: [buildJudge()],
      medal: "oro",
      modalityName: "Danza clásica",
      name: "Primera",
      orderNumber: 1,
      presentationId: "presentation-1",
      submodalityName: "Acrobacia",
      ...overrides,
    },
  };
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/presentacion/presentation-1/puntajes",
        element: <PresentationScoresView loaderData={loaderData} />,
      },
    ],
    {
      initialEntries: ["/administracion/presentacion/presentation-1/puntajes"],
    },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalPresentationEvaluationView } from "./view";
import type {
  PortalEvaluationJudge,
  PortalPresentationEvaluationLoaderData,
} from "./server";

const criteria = [
  { id: "tecnica", kind: "adds" as const, maximum: 100, name: "Técnica" },
  { id: "caidas", kind: "deducts" as const, maximum: 10, name: "Caídas" },
];

describe("PortalPresentationEvaluationView", () => {
  test("splits the sheet with a divider and signs what was deducted", () => {
    const markup = renderView({
      criteria,
      judges: [
        buildJudge({ criteriaValues: { caidas: "2.0", tecnica: "90.0" } }),
      ],
    });

    expect(markup).toContain("Técnica");
    expect(markup).toContain("90");
    expect(markup).toContain("−2");
    expect(markup).not.toContain("(resta)");
    expect(markup).toContain('data-slot="separator"');
  });

  test("leaves out the sheet divider when there is nothing to deduct", () => {
    const addingOnly = criteria.filter(
      (criterion) => criterion.kind === "adds",
    );
    const bothKinds = renderView({
      criteria,
      judges: [
        buildJudge({ criteriaValues: { caidas: "2.0", tecnica: "90.0" } }),
      ],
    });
    const markup = renderView({
      criteria: addingOnly,
      judges: [buildJudge({ criteriaValues: { tecnica: "90.0" } })],
    });

    expect(markup).toContain("Técnica");
    expect(markup).not.toContain("Caídas");
    // Only the one before `Devolución` is left: the sheet's own divider says a
    // deduction follows, and here none does.
    expect(countSeparators(markup)).toBe(countSeparators(bothKinds) - 1);
  });

  test("says so when a judge left no feedback", () => {
    const markup = renderView({ judges: [buildJudge()] });

    expect(markup).toContain("Este juez no dejó devolución.");
  });

  test("shows the disqualified badge, the notice and no numbers", () => {
    // The loader empties the sheet and the score of a disqualified
    // presentation, so the view is only asked to lay out the feedback.
    const markup = renderView({
      average: null,
      disqualified: true,
      judges: [buildJudge({ judgeName: "Ana Juez" })],
      medal: null,
    });

    expect(markup).toContain("Descalificada");
    expect(markup).toContain("no tiene puntaje ni premio");
    expect(markup).toContain("Ana Juez");
    expect(markup).not.toContain("/ 100");
  });

  test("says there is nothing to show when no judge survived the filter", () => {
    const markup = renderView({ average: null, judges: [], medal: null });

    expect(markup).toContain(
      "Esta presentación no tiene puntajes para mostrar.",
    );
    expect(markup).not.toContain("Devolución");
  });

  test("leaves the notice out of a disqualified presentation with no judges", () => {
    // The disqualification alert already says what happened; a second notice
    // under it would only repeat it.
    const markup = renderView({
      average: null,
      disqualified: true,
      judges: [],
      medal: null,
    });

    expect(markup).toContain("no tiene puntaje ni premio");
    expect(markup).not.toContain("no tiene puntajes para mostrar");
  });

  test("shows neither medal nor average when nothing counted", () => {
    const markup = renderView({
      average: null,
      judges: [buildJudge({ judgeName: "Ana Juez" })],
      medal: null,
    });

    expect(markup).not.toContain("Medalla");
    expect(markup).not.toContain("/ 100");
    expect(markup).toContain("Devolución");
  });
});

function countSeparators(markup: string) {
  return markup.split('data-slot="separator"').length - 1;
}

function buildJudge(
  overrides: Partial<PortalEvaluationJudge> = {},
): PortalEvaluationJudge {
  return {
    criteriaValues: {},
    feedbackAudioUrl: null,
    judgeId: "judge-1",
    judgeName: "Ana Juez",
    value: null,
    ...overrides,
  };
}

function renderView(
  overrides: Partial<PortalPresentationEvaluationLoaderData> = {},
) {
  const loaderData: PortalPresentationEvaluationLoaderData = {
    average: 90,
    criteria: [],
    details: "Infantil · Solo · Jazz",
    disqualified: false,
    judges: [buildJudge()],
    medal: "gold",
    title: "N.º 1 · Pieza",
    ...overrides,
  };

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/presentaciones/uno"]}>
      <PortalPresentationEvaluationView loaderData={loaderData} />
    </MemoryRouter>,
  );
}

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
  test("heads the page with the presentation, its medal and its average", () => {
    const markup = renderView({
      average: 81.33,
      details: "Infantil · Solo · Amateur · Jazz",
      medal: "silver",
      title: "N.º 12 · Pieza",
    });

    expect(markup).toContain("N.º 12 · Pieza");
    expect(markup).toContain("Medalla de plata");
    expect(markup).toContain("81.33");
    expect(markup).toContain("Infantil · Solo · Amateur · Jazz");
  });

  test("names each judge beside the score they gave", () => {
    const markup = renderView({
      judges: [buildJudge({ judgeName: "Ana Juez", value: "84.0" })],
    });

    expect(markup).toContain("Ana Juez");
    expect(markup).toContain("84");
    expect(markup).toContain("/ 100");
  });

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

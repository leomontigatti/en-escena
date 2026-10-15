import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Navigation } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

const reactRouterMocks = vi.hoisted(() => ({
  useNavigation: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return { ...actual, useNavigation: reactRouterMocks.useNavigation };
});

import { renderInDataRouter } from "@/lib/test-support/data-router";
import AcademyOnboardingRoute from "@/routes/registro_.academia";

// #1356: the submit creates the academy, so it must not take a second click
// while the first one is in flight, as on the other access pages.
describe("`/registro/academia` submit", () => {
  beforeEach(() => {
    reactRouterMocks.useNavigation.mockReturnValue({
      state: "idle",
    } satisfies Partial<Navigation>);
  });

  test("is enabled and without a spinner while nothing is submitting", () => {
    const button = renderSubmitButton();

    expect(button).not.toContain(' disabled=""');
    expect(button).not.toContain('data-slot="spinner"');
  });

  test("is disabled with a spinner while the onboarding post is in flight", () => {
    reactRouterMocks.useNavigation.mockReturnValue({
      formMethod: "POST",
      state: "submitting",
    } satisfies Partial<Navigation>);

    const button = renderSubmitButton();

    expect(button).toContain(' disabled=""');
    expect(button).toContain('data-slot="spinner"');
  });
});

/** The markup of the `Crear academia` button alone. */
function renderSubmitButton() {
  const markup = renderToStaticMarkup(
    renderInDataRouter(
      "/registro/academia",
      createElement(AcademyOnboardingRoute),
    ),
  );
  const button = /<button[^>]*type="submit"[^>]*>.*?<\/button>/s.exec(markup);

  if (!button?.[0].includes("Crear academia")) {
    throw new Error("Expected the `Crear academia` submit to be rendered.");
  }

  return button[0];
}

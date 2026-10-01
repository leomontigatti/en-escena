/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { ChoreographyDuplicateWarning } from "./duplicate-warning";

describe("ChoreographyDuplicateWarning", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("links each piece it found to its page, opened beside the wizard", async () => {
    const matches = [
      { choreographyNumber: 7, id: "choreography_1", name: "Luna Llena" },
      { choreographyNumber: 9, id: "choreography_2", name: "Luna Nueva" },
    ];

    await renderer.renderAsync(
      <ChoreographyDuplicateWarning
        isSubmitting={false}
        matches={matches}
        onContinue={vi.fn()}
        warning={matches}
      />,
    );

    expect(document.body.textContent).toContain(
      "Ya existe una coreografía con el mismo nombre y los mismos bailarines en este evento: Luna Llena y Luna Nueva.",
    );
    expect(
      Array.from(document.querySelectorAll("a")).map((link) => ({
        href: link.getAttribute("href"),
        target: link.getAttribute("target"),
        text: link.textContent?.trim(),
      })),
    ).toEqual([
      {
        href: "/portal/coreografias/choreography_1",
        target: "_blank",
        text: "Luna Llena",
      },
      {
        href: "/portal/coreografias/choreography_2",
        target: "_blank",
        text: "Luna Nueva",
      },
    ]);
  });
});

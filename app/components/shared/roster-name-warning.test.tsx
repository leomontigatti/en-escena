/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";

import { RosterNameWarningDialog } from "./roster-name-warning";

describe("RosterNameWarningDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderDialog(warning: RosterNameWarning) {
    await renderer.renderAsync(
      <>
        <form id="dancer-form" />
        <RosterNameWarningDialog
          formId="dancer-form"
          isPending={false}
          warning={warning}
        />
      </>,
    );
  }

  function matchLinks() {
    return Array.from(document.querySelectorAll("a")).map((link) => ({
      href: link.getAttribute("href"),
      rel: link.getAttribute("rel"),
      target: link.getAttribute("target"),
      text: link.textContent?.trim(),
    }));
  }

  test("links each match to their page, opened beside the form", async () => {
    await renderDialog({
      kind: "dancer-name",
      matches: [{ id: "dancer_1", label: "Ana Paz" }],
      scope: "portal",
    });

    expect(document.body.textContent).toContain(
      "Ya existe un bailarín con el mismo nombre y fecha de nacimiento en tu academia: Ana Paz.",
    );
    expect(matchLinks()).toEqual([
      {
        href: "/portal/bailarines/dancer_1",
        rel: "noreferrer",
        target: "_blank",
        text: "Ana Paz",
      },
    ]);
  });

  test("reads as a list when it found more than one", async () => {
    await renderDialog({
      kind: "professor-name",
      matches: [
        { id: "professor_1", label: "Ana Paz" },
        { id: "professor_2", label: "Ana Paz" },
        { id: "professor_3", label: "Ana Paz" },
      ],
      scope: "admin",
    });

    expect(document.body.textContent).toContain(
      "en la academia: Ana Paz, Ana Paz y Ana Paz.",
    );
    expect(matchLinks().map((link) => link.href)).toEqual([
      "/administracion/profesores/professor_1",
      "/administracion/profesores/professor_2",
      "/administracion/profesores/professor_3",
    ]);
  });
});

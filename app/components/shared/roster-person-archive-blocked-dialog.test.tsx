/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { RosterPersonArchiveBlockedDialog } from "./roster-person-archive-blocked-dialog";

describe("RosterPersonArchiveBlockedDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  // The title is composed from the kind's noun since #1479; both kinds pin
  // the copy it replaced.
  test.each([
    ["dancer", "No se puede archivar al bailarín"],
    ["professor", "No se puede archivar al profesor"],
  ] as const)(
    "names the %s and why, with Cerrar as its only button",
    async (kind, title) => {
      await renderer.renderAsync(
        <RosterPersonArchiveBlockedDialog
          kind={kind}
          onOpenChange={() => {}}
          open
        />,
      );

      const dialog = document.querySelector('[role="alertdialog"]');

      expect(dialog?.textContent).toContain(title);
      expect(dialog?.textContent).toContain("Participa del evento activo");
      expect(
        [...(dialog?.querySelectorAll("button") ?? [])].map((button) =>
          button.textContent?.trim(),
        ),
      ).toEqual(["Cerrar"]);
    },
  );
});

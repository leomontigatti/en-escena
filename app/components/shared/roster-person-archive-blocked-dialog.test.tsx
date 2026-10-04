/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { RosterPersonArchiveBlockedDialog } from "./roster-person-archive-blocked-dialog";

describe("RosterPersonArchiveBlockedDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("names the person kind and why, with Cerrar as its only button", async () => {
    await renderer.renderAsync(
      <RosterPersonArchiveBlockedDialog
        kind="professor"
        onOpenChange={() => {}}
        open
      />,
    );

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("No se puede archivar al profesor");
    expect(dialog?.textContent).toContain("Participa del evento activo");
    expect(
      [...(dialog?.querySelectorAll("button") ?? [])].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Cerrar"]);
  });
});

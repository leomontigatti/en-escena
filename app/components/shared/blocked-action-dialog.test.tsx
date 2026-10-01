/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { BlockedActionDialog } from "./blocked-action-dialog";

describe("BlockedActionDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  // An acknowledgment asks nothing: there is no verb to press, so a blocked
  // action cannot be confirmed from it by accident.
  test("offers Cerrar and nothing else", async () => {
    await renderer.renderAsync(
      <BlockedActionDialog
        description="Para bonificarla, primero quitá el dinero de sus inscripciones."
        onOpenChange={() => {}}
        open
        reasons="Bea Lagos tiene $ 10.000 asignados."
        reasonsTitle="Inscripciones con dinero asignado"
        title="No se puede bonificar la coreografía"
      />,
    );

    expect(
      [...document.querySelectorAll('[role="alertdialog"] button')].map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(["Cerrar"]);
  });
});

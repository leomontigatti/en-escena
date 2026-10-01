/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { BlockedActionDialog } from "./blocked-action-dialog";

describe("BlockedActionDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderDialog(
    props: Partial<ComponentProps<typeof BlockedActionDialog>> = {},
  ) {
    await renderer.renderAsync(
      <BlockedActionDialog
        description="Para bonificarla, primero quitá el dinero de sus inscripciones."
        onOpenChange={() => {}}
        open
        reasons={
          <ul>
            <li>Bea Lagos tiene $ 10.000 asignados.</li>
          </ul>
        }
        reasonsTitle="Inscripciones con dinero asignado"
        title="No se puede bonificar la coreografía"
        {...props}
      />,
    );
  }

  test("says what cannot be done, what it takes and every reason, with Cerrar as its only button", async () => {
    await renderDialog();

    const dialog = document.querySelector('[role="alertdialog"]');
    const alert = dialog?.querySelector('[role="alert"]');

    expect(dialog?.textContent).toContain(
      "No se puede bonificar la coreografía",
    );
    expect(dialog?.textContent).toContain(
      "Para bonificarla, primero quitá el dinero de sus inscripciones.",
    );
    expect(alert?.className.split(" ")).toContain("text-info");
    expect(alert?.textContent).toContain("Inscripciones con dinero asignado");
    expect(alert?.textContent).toContain("Bea Lagos tiene $ 10.000 asignados.");
    expect(
      Array.from(dialog?.querySelectorAll("button") ?? []).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Cerrar"]);
  });

  test("closes on Cerrar", async () => {
    const onOpenChange = vi.fn();

    await renderDialog({ onOpenChange });
    await clickReactDomButton("Cerrar", { exact: true });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("closes on Escape", async () => {
    const onOpenChange = vi.fn();

    await renderDialog({ onOpenChange });
    await updateReactDomForm(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("widens to fit the list of reasons", async () => {
    await renderDialog();

    expect(
      document.querySelector('[data-slot="alert-dialog-content"]')?.className,
    ).toContain("sm:max-w-lg");
  });
});

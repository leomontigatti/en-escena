/** @vitest-environment jsdom */

import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { ConfirmationDialog } from "./confirmation-dialog";

describe("ConfirmationDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderDialog(
    props: Partial<ComponentProps<typeof ConfirmationDialog>> = {},
  ) {
    await renderer.renderAsync(
      <ConfirmationDialog
        confirmLabel="Archivar"
        description="El profesor deja de aparecer en el portal."
        onOpenChange={() => {}}
        open
        title="¿Archivar al profesor?"
        {...props}
      />,
    );
  }

  function footerLabels() {
    return Array.from(
      document.querySelectorAll('[role="alertdialog"] button'),
    ).map((button) => button.textContent?.trim());
  }

  test("asks its question and offers Cancelar, then the verb", async () => {
    await renderDialog();

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("¿Archivar al profesor?");
    expect(dialog?.textContent).toContain(
      "El profesor deja de aparecer en el portal.",
    );
    expect(footerLabels()).toEqual(["Cancelar", "Archivar"]);
  });

  test("submits the form it names", async () => {
    await renderDialog({ form: "archive-form" });

    const button = getButton("Archivar");

    expect(button.type).toBe("submit");
    expect(button.getAttribute("form")).toBe("archive-form");
  });

  test("runs onConfirm when it submits no form", async () => {
    const onConfirm = vi.fn();

    await renderDialog({ onConfirm });
    await clickReactDomButton("Archivar", { exact: true });

    expect(getButton("Cancelar")).toBeDefined();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test("paints the verb destructive only when asked", async () => {
    await renderDialog({ destructive: true });

    expect(getButton("Archivar").dataset.variant).toBe("destructive");
  });

  test("leads the verb with its icon", async () => {
    await renderDialog({ confirmIcon: Check, confirmLabel: "Guardar" });

    expect(
      getButton("Guardar").querySelector("svg")?.getAttribute("data-icon"),
    ).toBe("inline-start");
  });

  test("renders what it is given between the question and the footer", async () => {
    await renderDialog({ children: <p>Revisá las categorías</p> });

    expect(document.body.textContent).toContain("Revisá las categorías");
  });
});

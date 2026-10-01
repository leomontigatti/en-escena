/** @vitest-environment jsdom */

import { Check } from "lucide-react";
import { type ComponentProps, useState } from "react";
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

  // A browser drops the submission of a form that is no longer in the
  // document, and a user's click lets React unmount the dialog before the
  // click's default action runs. jsdom flushes later, so the assertion is the
  // order instead: the form has submitted by the time the click has finished
  // bubbling, not in its default action after it.
  test("submits the form it names during the click, before the parent can unmount the dialog", async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    const submittedWhenClickEnded: number[] = [];
    const recordClickEnd = () => {
      submittedWhenClickEnded.push(onSubmit.mock.calls.length);
    };

    function Parent() {
      const [isOpen, setIsOpen] = useState(true);

      return isOpen ? (
        <ConfirmationDialog
          confirmLabel="Archivar"
          description="El profesor deja de aparecer en el portal."
          form="archive-form"
          onOpenChange={(open) => {
            if (!open) {
              setIsOpen(false);
            }
          }}
          open
          title="¿Archivar al profesor?"
        >
          <form id="archive-form" onSubmit={onSubmit} />
        </ConfirmationDialog>
      ) : null;
    }

    await renderer.renderAsync(<Parent />);
    window.addEventListener("click", recordClickEnd);
    try {
      await clickReactDomButton("Archivar", { exact: true });
    } finally {
      window.removeEventListener("click", recordClickEnd);
    }

    expect(submittedWhenClickEnded).toEqual([1]);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(document.querySelector("#archive-form")).toBeNull();
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

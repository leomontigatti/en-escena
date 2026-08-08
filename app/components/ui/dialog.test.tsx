/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

describe("DialogContent dismissal", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(onOpenChange: (open: boolean) => void) {
    await renderer.renderAsync(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar plata</DialogTitle>
            <DialogDescription>Un diálogo con un select.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    // Radix arms its outside-pointer-down listener a task after mounting.
    await flushTasks();
  }

  /**
   * Reproduces the press a popover swallows: an open `Select` blocks pointer
   * events on the `body`, so the press that dismisses it lands on the document
   * and never on an element of the dialog. Radix defers that press to the
   * `click` after it, which is where the dialog used to read it as an outside
   * interaction and close (#708).
   */
  async function pressOn(target: EventTarget) {
    await act(async () => {
      target.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    await flushTasks();
  }

  test("stays open when the press was swallowed by a popover above it", async () => {
    const onOpenChange = vi.fn();
    await mount(onOpenChange);

    await pressOn(document.documentElement);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("closes when the press lands on the overlay", async () => {
    const onOpenChange = vi.fn();
    await mount(onOpenChange);

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    if (!overlay) {
      throw new Error("Expected the dialog overlay to be rendered.");
    }

    await pressOn(overlay);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

async function flushTasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

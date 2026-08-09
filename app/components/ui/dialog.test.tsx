/** @vitest-environment jsdom */

import { act, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  function DialogWithSelect({
    onOpenChange,
    selectStartsOpen,
  }: {
    onOpenChange: (open: boolean) => void;
    selectStartsOpen: boolean;
  }) {
    const [isSelectOpen, setIsSelectOpen] = useState(selectStartsOpen);

    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar plata</DialogTitle>
            <DialogDescription>Un diálogo con un select.</DialogDescription>
          </DialogHeader>
          <Select open={isSelectOpen} onOpenChange={setIsSelectOpen}>
            <SelectTrigger>
              <SelectValue placeholder="Precio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </DialogContent>
      </Dialog>
    );
  }

  async function mount(
    onOpenChange: (open: boolean) => void,
    { selectStartsOpen }: { selectStartsOpen: boolean },
  ) {
    await renderer.renderAsync(
      <DialogWithSelect
        onOpenChange={onOpenChange}
        selectStartsOpen={selectStartsOpen}
      />,
    );

    // Radix arms its outside-pointer-down listener a task after mounting.
    await flushTasks();
  }

  function isSelectOpen() {
    return document.querySelector('[data-slot="select-content"]') !== null;
  }

  /**
   * Presses the overlay, which is where every press inside a modal dialog lands
   * while a layer above it disables pointer events on the rest of the document.
   * `pointerdown` dismisses the layer above; the dialog only decides on the
   * `click` that follows, because Radix defers its outside-pointer-down.
   */
  async function pressOverlay() {
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    if (!overlay) {
      throw new Error("Expected the dialog overlay to be rendered.");
    }

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
    });

    await act(async () => {
      overlay.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    await flushTasks();
  }

  test("stays open when the press only dismissed the select above it", async () => {
    const onOpenChange = vi.fn();
    await mount(onOpenChange, { selectStartsOpen: true });

    expect(isSelectOpen()).toBe(true);

    await pressOverlay();

    expect(isSelectOpen()).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("closes when the press lands on the overlay with no select open", async () => {
    const onOpenChange = vi.fn();
    await mount(onOpenChange, { selectStartsOpen: false });

    expect(isSelectOpen()).toBe(false);

    await pressOverlay();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

async function flushTasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

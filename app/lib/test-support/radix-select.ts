/**
 * Driving a Radix `Select` from a jsdom test. It is here rather than in each
 * test file because the way to open one and pick from it is a property of Radix
 * and of jsdom, not of any screen: three suites had grown their own copy, and a
 * fourth copy is how the four start to disagree about what a click is.
 */

import { act } from "react";

/**
 * Opens the select the trigger belongs to. Radix opens on `pointerdown` and
 * captures the pointer, which jsdom does not implement, so the three capture
 * methods are stubbed onto the element before the event goes out.
 */
export async function openRadixSelect(trigger: Element | null | undefined) {
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Expected a select trigger to be rendered.");
  }

  trigger.hasPointerCapture ??= () => false;
  trigger.setPointerCapture ??= () => {};
  trigger.releasePointerCapture ??= () => {};

  await act(async () => {
    trigger.dispatchEvent(radixPointerEvent("pointerdown"));
    await Promise.resolve();
  });

  // Radix mounts the list in a portal after a frame of its own.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/**
 * Picks an option of the open select, by the text it reads.
 *
 * Radix selects on `Enter` over the focused item. jsdom has no layout, so the
 * pointer path Radix uses for a mouse cannot be replayed faithfully; the
 * keyboard one reaches the same `onValueChange`.
 */
export async function selectRadixOption(text: string) {
  const option = [
    ...document.querySelectorAll('[data-slot="select-item"]'),
  ].find((candidate) => candidate.textContent?.trim() === text);

  if (!option) {
    throw new Error(`Expected the option "${text}" to be rendered.`);
  }

  await act(async () => {
    option.dispatchEvent(radixPointerEvent("pointermove"));
    await Promise.resolve();
  });

  await act(async () => {
    option.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      }),
    );
    await Promise.resolve();
  });
}

/**
 * A mouse pointer event jsdom will build. `PointerEvent` is not implemented, and
 * Radix ignores anything whose `pointerType` is not a real one, so the property
 * is defined onto a `MouseEvent`.
 */
function radixPointerEvent(type: string) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerType", { value: "mouse" });

  return event;
}

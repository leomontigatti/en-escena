/** @vitest-environment jsdom */

// The label points at the popover trigger, so a label click while the popover
// is open used to dismiss it as an outside press and then reopen it through the
// trigger it activates (#1237).

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { MultiComboboxField } from "./multi-combobox-field";
import {
  createReactDomTestRenderer,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function GroupTypesField() {
  const form = useForm({ defaultValues: { groupTypes: [] as string[] } });

  return (
    <MultiComboboxField
      control={form.control}
      label="Tipos de grupo"
      name="groupTypes"
      options={[
        { value: "solo", label: "Solo" },
        { value: "duo", label: "Dúo" },
      ]}
      placeholder="Seleccioná tipos de grupo"
    />
  );
}

function getTrigger() {
  return document.querySelector<HTMLElement>('[data-slot="combobox-trigger"]');
}

function getLabel() {
  return document.querySelector<HTMLElement>('[data-slot="field-label"]');
}

function isOpen() {
  return getTrigger()?.getAttribute("aria-expanded") === "true";
}

/**
 * The event sequence a real click sends, which is what outside press reads.
 * jsdom has no `PointerEvent`, so the pointer events go out as mouse events.
 */
async function pressAndClick(element: HTMLElement) {
  await updateReactDomForm(() => {
    const init = { bubbles: true, cancelable: true, composed: true };
    element.dispatchEvent(new MouseEvent("pointerdown", init));
    element.dispatchEvent(new MouseEvent("mousedown", init));
    element.dispatchEvent(new MouseEvent("pointerup", init));
    element.dispatchEvent(new MouseEvent("mouseup", init));
    element.click();
  });
}

describe("MultiComboboxField label", () => {
  test("closes an open popover and leaves it closed", async () => {
    await renderer.renderAsync(<GroupTypesField />);
    await pressAndClick(getTrigger() as HTMLElement);
    expect(isOpen()).toBe(true);

    await pressAndClick(getLabel() as HTMLElement);

    expect(isOpen()).toBe(false);
  });

  test("focuses the field without opening the popover", async () => {
    await renderer.renderAsync(<GroupTypesField />);

    await pressAndClick(getLabel() as HTMLElement);

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(getTrigger());
  });
});

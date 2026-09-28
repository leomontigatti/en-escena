/**
 * Driving a data table's filters from a jsdom test. Each applied filter is a
 * button group named after its field and value, which is what a reader —and a
 * test— finds it by.
 */

import { act } from "react";

/** The applied filters, each read as `<field>: <value>`, in toolbar order. */
export function getAppliedTableFilters() {
  return [...document.querySelectorAll("[data-filter-group]")].map(
    (filter) => filter.getAttribute("aria-label") ?? "",
  );
}

/** Removes an applied filter with its trash button. */
export async function removeTableFilter(groupLabel: string) {
  const button = document.querySelector(
    `button[aria-label="Quitar filtro ${groupLabel}"]`,
  );

  if (!button) {
    throw new Error(`Expected the "${groupLabel}" filter to be applied.`);
  }

  await click(button);
}

/** Picks another value for an applied filter, from its value button's menu. */
export async function changeTableFilter(
  groupLabel: string,
  optionLabel: string,
) {
  const trigger = document.querySelector(
    `[data-filter-group][aria-label^="${groupLabel}: "] [aria-haspopup="menu"]`,
  );

  if (!(trigger instanceof HTMLElement)) {
    throw new Error(`Expected the "${groupLabel}" filter to be applied.`);
  }

  // Radix opens a menu on `pointerdown`, then mounts it in a portal.
  await act(async () => {
    trigger.dispatchEvent(radixPointerEvent("pointerdown"));
    await Promise.resolve();
  });

  const option = [...document.querySelectorAll('[role="menuitemradio"]')].find(
    (candidate) => candidate.textContent?.trim() === optionLabel,
  );

  if (!option) {
    throw new Error(`Expected the option "${optionLabel}" to be offered.`);
  }

  await click(option);
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

/**
 * A mouse pointer event jsdom will build: `PointerEvent` is not implemented,
 * and Radix ignores an event whose `pointerType` is not a real one.
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

/** Adds a filter through the "Agregar filtro" picker: the group, then a value. */
export async function addTableFilter(groupLabel: string, optionLabel: string) {
  const trigger = document.querySelector('button[aria-label="Agregar filtro"]');

  if (!trigger) {
    throw new Error("Expected the table to offer adding a filter.");
  }

  await click(trigger);
  await click(findPickerButton(groupLabel));
  await click(findPickerButton(optionLabel));
}

function findPickerButton(text: string) {
  const button = [
    ...document.querySelectorAll('[data-slot="popover-content"] button'),
  ].find((candidate) => candidate.textContent?.trim() === text);

  if (!button) {
    throw new Error(`Expected the filter picker to offer "${text}".`);
  }

  return button;
}

/**
 * Filters by a value whether or not its group is applied yet: through the
 * group's value menu when it is, through "Agregar filtro" when it is not.
 */
export async function applyTableFilter(
  groupLabel: string,
  optionLabel: string,
) {
  if (
    getAppliedTableFilters().some((filter) =>
      filter.startsWith(`${groupLabel}: `),
    )
  ) {
    await changeTableFilter(groupLabel, optionLabel);
  } else {
    await addTableFilter(groupLabel, optionLabel);
  }
}

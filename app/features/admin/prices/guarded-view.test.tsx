/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { EventPriceDetailView } from "@/features/admin/prices/detail/view";
import type { EventPricesLoaderData } from "@/features/admin/prices/shared";
import type { PriceListItem } from "@/lib/events/bases.server";
import { readPriceDeletionBlock } from "@/features/admin/prices/view-shared";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

describe("guarded price detail", () => {
  test("edits every field of an unguarded row", async () => {
    await renderDetail();

    const controls = readEditableControls();

    expect(readAlertText()).toBeNull();
    expect(controls.groupType).not.toBeNull();
    expect(controls.amount).not.toBeNull();
    expect(controls.deadline).not.toBeNull();
  });

  test("locks a frozen row down to its name and explains why", async () => {
    await renderDetail({ isFrozen: true });

    expect(readAlertText()).toContain(
      "hay inscripciones que congelaron este precio.",
    );
    // Every guarded field reads through the shared read-only look, so the
    // locked values travel as hidden inputs and nothing is editable but the
    // name.
    expect(isLocked("group-type")).toBe(true);
    expect(isLocked("amount")).toBe(true);
    expect(isLocked("payment-deadline")).toBe(true);
    expect(getNameInput().disabled).toBe(false);
  });

  test("keeps the amount of the row that keeps its group type covered", async () => {
    await renderDetail({ keepsCoverage: true, paymentDeadline: null });

    expect(readAlertText()).toContain("Podés cambiarle el monto.");
    expect(readEditableControls().amount).not.toBeNull();
    expect(isLocked("group-type")).toBe(true);
    expect(isLocked("payment-deadline")).toBe(true);
    expect(readDeadlineDisplay()).toBe("Sin fecha límite");
    expect(getNameInput().disabled).toBe(false);
  });

  // The structural values a locked form still has to post: a save of the name
  // must not blank the fields the guard closed.
  test("posts the locked values of a frozen row unchanged", async () => {
    await renderDetail({ isFrozen: true });

    expect(readHiddenValue("groupType")).toBe("solo");
    expect(readHiddenValue("amount")).toBe("12000");
    expect(readHiddenValue("paymentDeadline")).toBe("2026-05-31");
  });
});

describe("guarded price deletion", () => {
  test("opens the delete dialog blocked for a frozen row", async () => {
    await renderDetail({ isFrozen: true }, { initialDeleteDialogOpen: true });

    const dialog = getDeleteDialog();

    expect(dialog.textContent).toContain(
      "No se puede borrar el precio porque hay inscripciones que congelaron este precio.",
    );
    expect(dialog.querySelector("form")).toBeNull();
    expect(dialog.textContent).toContain(
      readPriceDeletionBlock({ isFrozen: true, keepsCoverage: false }),
    );
  });

  test("opens the delete dialog blocked for the row that keeps coverage", async () => {
    await renderDetail(
      { keepsCoverage: true, paymentDeadline: null },
      { initialDeleteDialogOpen: true },
    );

    const dialog = getDeleteDialog();

    expect(dialog.textContent).toContain(
      "No se puede borrar el precio porque es el único sin fecha límite de ese tipo de grupo, que tiene inscripciones activas.",
    );
    expect(dialog.querySelector("form")).toBeNull();
    expect(dialog.textContent).toContain(
      readPriceDeletionBlock({ isFrozen: false, keepsCoverage: true }),
    );
  });

  test("offers the delete form on an unguarded row", async () => {
    await renderDetail({}, { initialDeleteDialogOpen: true });

    const dialog = getDeleteDialog();

    expect(dialog.textContent).not.toContain("No se puede borrar el precio");
    expect(dialog.querySelector("form")).not.toBeNull();
    expect(
      readPriceDeletionBlock({ isFrozen: false, keepsCoverage: false }),
    ).toBeNull();
  });
});

async function renderDetail(
  overrides: Partial<PriceListItem> = {},
  { initialDeleteDialogOpen = false } = {},
) {
  const price = buildPrice(overrides);
  const path = `/administracion/precios/${price.id}`;
  const router = createMemoryRouter(
    [
      {
        path,
        action: async () => null,
        element: (
          <EventPriceDetailView
            initialDeleteDialogOpen={initialDeleteDialogOpen}
            loaderData={buildLoaderData(price)}
            priceId={price.id}
          />
        ),
      },
    ],
    { initialEntries: [path] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

/**
 * A locked field renders through the shared read-only look, whose control is a
 * disabled input carrying the field's id — whatever the editable control for
 * that field happens to be (a select, a date popover, a number input).
 */
function isLocked(field: string) {
  const control = renderer
    .getContainer()
    .querySelector(`#price-${field}-price_1`);

  return control instanceof HTMLInputElement && control.disabled;
}

/** The controls an open form offers, one per field the guards can close. */
function readEditableControls() {
  const container = renderer.getContainer();

  return {
    amount: container.querySelector(
      'input[name="amount"]:not([type="hidden"])',
    ),
    deadline: container.querySelector('[data-slot="popover-trigger"]'),
    groupType: container.querySelector('[data-slot="select-trigger"]'),
  };
}

/** What the read-only deadline reads, which is its control's value. */
function readDeadlineDisplay() {
  const input = renderer
    .getContainer()
    .querySelector<HTMLInputElement>("#price-payment-deadline-price_1");

  if (!input) {
    throw new Error("Expected the deadline field to be rendered.");
  }

  return input.value;
}

function readHiddenValue(name: string) {
  const input = renderer
    .getContainer()
    .querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);

  if (!input) {
    throw new Error(`Expected a hidden input named ${name} to be rendered.`);
  }

  return input.value;
}

function getNameInput() {
  const input = renderer
    .getContainer()
    .querySelector<HTMLInputElement>('input[name="name"]');

  if (!input) {
    throw new Error("Expected the name field to be rendered.");
  }

  return input;
}

function readAlertText() {
  const alert = renderer.getContainer().querySelector('[role="alert"]');

  return alert?.textContent ?? null;
}

function getDeleteDialog() {
  const dialog = document.querySelector('[role="alertdialog"]');

  if (!dialog) {
    throw new Error("Expected the delete dialog to be open.");
  }

  return dialog;
}

function buildLoaderData(price: PriceListItem): EventPricesLoaderData {
  return {
    selectedEventId: "event_1",
    seminarPrices: [],
    schedules: [],
    prices: [price],
  };
}

function buildPrice(overrides: Partial<PriceListItem> = {}): PriceListItem {
  return {
    id: "price_1",
    name: "Precio Solo",
    eventId: "event_1",
    groupType: "solo",
    amount: 12000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    schedule: null,
    isFrozen: false,
    keepsCoverage: false,
    ...overrides,
  };
}

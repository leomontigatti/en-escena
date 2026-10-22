/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  createReactDomTestRenderer,
  findButton,
  getReactDomTexts,
  getTitleBadgeTexts,
} from "@/lib/test-support/react-dom";

import { ComprobanteDetailRouteView } from "./view";
import type { ComprobanteDetail } from "./server";

function comprobanteFixture(
  overrides: Partial<ComprobanteDetail> = {},
): ComprobanteDetail {
  return {
    id: "comprobante_1",
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 41,
    cbteFch: "20260722",
    impTotal: 7000,
    cae: "74123456789012",
    caeVto: "20260801",
    fchServDesde: "20260801",
    fchServHasta: "20260803",
    fchVtoPago: "20260722",
    status: "valid",
    anchor: {
      kind: "choreography",
      choreographyId: "choreography_1",
      choreographyName: "Aire",
    },
    academyId: "academy_1",
    academyName: "Academia Centro",
    eventName: "En Escena 2026",
    lines: [
      {
        id: "line_1",
        description: "Inscripción — Ana López",
        amount: 7000,
        withdrawn: false,
      },
    ],
    association: { role: "factura", adjustments: [] },
    ...overrides,
  };
}

// The detail shows its data as locked inputs, whose value is not text content.
function lockedFieldValue(label: string) {
  const labelElement = Array.from(document.querySelectorAll("label")).find(
    (element) => element.textContent === label,
  );
  const input = labelElement
    ? document.getElementById(labelElement.htmlFor)
    : null;

  if (!(input instanceof HTMLInputElement) || !input.disabled) {
    throw new Error(`No locked field labelled ${label}`);
  }

  return input.value;
}

/**
 * The actions menu only mounts its items once it opens, and the trigger opens on
 * `pointerdown` rather than on `click`.
 */
async function openActionsMenu() {
  const trigger = findButton("Acciones", { exact: true });

  if (!trigger) {
    throw new Error("Expected the actions menu trigger to be rendered.");
  }

  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

describe("ComprobanteDetailRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(props: { comprobante?: Partial<ComprobanteDetail> }) {
    const view = (
      <ComprobanteDetailRouteView
        loaderData={{ comprobante: comprobanteFixture(props.comprobante) }}
      />
    );
    const router = createMemoryRouter([{ path: "/", element: view }], {
      initialEntries: ["/"],
    });

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("renders the comprobante data and the actions menu", async () => {
    await mount({});

    // Data from the fiscal snapshot.
    expect(document.body.textContent).toContain("0001-00000041");
    expect(lockedFieldValue("Tipo")).toBe("Factura C");
    expect(lockedFieldValue("Academia")).toBe("Academia Centro");
    expect(lockedFieldValue("Coreografía")).toBe("Aire");
    // `porcion` is deleted, so the detail no longer carries a `Porción` field.
    expect(document.body.textContent).not.toContain("Porción");

    // Actions menu hosted in the header.
    expect(findButton("Acciones", { exact: true })).toBeDefined();
  });

  test("a seminar comprobante names its unit under `Seminario`, linked to the `(seminar, academy)` detail", async () => {
    await mount({
      comprobante: {
        anchor: {
          kind: "seminar",
          seminarId: "seminar_1",
          instructorName: "Abril Sosa",
          scheduledDate: "2030-10-10",
        },
      },
    });

    expect(lockedFieldValue("Seminario")).toBe(
      "Seminario Abril Sosa, 10/10/2030",
    );
    expect(document.body.textContent).not.toContain("Coreografía");

    await openActionsMenu();

    const unitLink = document.querySelector(
      'a[href="/administracion/finanzas/academy_1/seminarios/seminar_1"]',
    );
    expect(unitLink?.getAttribute("role")).toBe("menuitem");
    expect(unitLink?.textContent).toBe("Ver el seminario");
  });

  // ADR-0014 §5: a manual annul would leave a positive delta demanding a
  // debit note for the amount just credited, so no status offers one.
  test("offers no way to annul, whatever the status", async () => {
    await mount({});
    await openActionsMenu();

    expect(
      [...document.querySelectorAll('[role="menuitem"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Ver la coreografía", "Imprimir"]);
  });

  test("a note names its invoice and links to it", async () => {
    await mount({
      comprobante: {
        cbteTipo: 13,
        status: null,
        association: {
          role: "note",
          factura: {
            id: "factura_1",
            cbteTipo: 11,
            ptoVta: 1,
            cbteNro: 40,
            cbteFch: "20260715",
            impTotal: 7000,
          },
          adjustedDebitNotes: [],
        },
      },
    });

    expect(lockedFieldValue("Comprobante asociado")).toBe(
      "Factura C 0001-00000040",
    );

    await openActionsMenu();

    const facturaLink = document.querySelector(
      'a[href="/administracion/comprobantes/factura_1"]',
    );
    expect(facturaLink?.getAttribute("role")).toBe("menuitem");
    expect(facturaLink?.textContent).toBe("Ver la factura");
  });

  test("shows the derived status as the header's badge", async () => {
    await mount({ comprobante: { status: "annulled" } });

    expect(getTitleBadgeTexts()).toEqual(["Anulada"]);
    expect(getReactDomTexts("label")).not.toContain("Estado");
  });

  // The actions close the card they act on: a sticky footer only sticks as
  // the card's own last child.
  test("renders `Volver` in the card's pinned footer", async () => {
    await mount({});

    const volver = [...document.querySelectorAll("a")].find(
      (link) => link.textContent === "Volver",
    );
    const footer = volver?.closest('[data-slot="card-footer"]');

    expect(footer?.parentElement?.dataset.slot).toBe("card");
    expect(footer?.nextElementSibling).toBeNull();
  });
});

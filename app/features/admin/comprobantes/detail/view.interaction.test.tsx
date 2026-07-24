/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AdministracionComprobanteDetalleRouteView } from "./view";
import type { ComprobanteDetail } from "./server";
import { annulComprobanteIntent } from "./shared";

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
    porcion: "seña",
    fchServDesde: "20260801",
    fchServHasta: "20260803",
    fchVtoPago: "20260722",
    status: "vigente",
    choreographyId: "choreography_1",
    choreographyName: "Aire",
    academyId: "academy_1",
    academyName: "Academia Centro",
    eventName: "En Escena 2026",
    canAnnul: true,
    ...overrides,
  };
}

describe("AdministracionComprobanteDetalleRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(props: {
    comprobante?: Partial<ComprobanteDetail>;
    initialAnnulDialogOpen?: boolean;
  }) {
    const view = (
      <AdministracionComprobanteDetalleRouteView
        initialAnnulDialogOpen={props.initialAnnulDialogOpen}
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

    // Datos del snapshot fiscal.
    expect(document.body.textContent).toContain("0001-00000041");
    expect(document.body.textContent).toContain("Factura C");
    expect(document.body.textContent).toContain("Seña");
    expect(document.body.textContent).toContain("Academia Centro");
    expect(document.body.textContent).toContain("Aire");

    // Menú de acciones (imprimir/anular) alojado en el header.
    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();

    // El diálogo de anulación no está montado hasta que se lo abre.
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  test("confirms annulment through an alertdialog without a checkbox", async () => {
    await mount({ initialAnnulDialogOpen: true });

    // La confirmación es un AlertDialog: foco atrapado y anunciable por lectores.
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    // El copy dice qué se anula, por cuánto, y la salida real (Nota de crédito).
    expect(document.body.textContent).toContain("0001-00000041");
    expect(document.body.textContent).toContain("7.000");
    expect(document.body.textContent).toMatch(/nota de crédito/i);

    // Sin checkbox: la confirmación es el diálogo mismo.
    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();

    // El intent de anulación viaja en el form.
    expect(
      document.querySelector(
        `input[name="intent"][value="${annulComprobanteIntent}"]`,
      ),
    ).not.toBeNull();
  });

  test("hides the annul affordance when the comprobante is already annulled", async () => {
    await mount({
      comprobante: { status: "anulada", canAnnul: false },
      initialAnnulDialogOpen: true,
    });

    expect(document.body.textContent).toContain("Anulada");
    // Sin comprobante vigente no hay anulación posible: ni diálogo ni acción.
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});

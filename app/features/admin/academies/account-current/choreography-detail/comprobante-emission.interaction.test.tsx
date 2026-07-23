/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { ComprobantesSection } from "./comprobante-emission";
import type { ChoreographyInvoicing } from "./server";

describe("ComprobantesSection emission flow", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(invoicing: ChoreographyInvoicing) {
    const router = createMemoryRouter(
      [{ path: "/", element: <ComprobantesSection invoicing={invoicing} /> }],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("disables the single action when there is no billable remainder", async () => {
    await mount({
      billableAmount: 0,
      porcion: null,
      canEmit: false,
      currency: null,
      lastComprobante: null,
    });

    expect(getButton("Emitir factura").disabled).toBe(true);
    expect(document.body.textContent).not.toContain("Total a facturar");
  });

  test("enables the single action and previews the computed portion and amount", async () => {
    await mount({
      billableAmount: 12000,
      porcion: "seña",
      canEmit: true,
      currency: null,
      lastComprobante: null,
    });

    expect(getButton("Emitir factura").disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Total a facturar");

    await clickReactDomButton("Emitir factura");

    // La confirmación es un AlertDialog: foco atrapado y anunciable por lectores.
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    // Previsualiza la porción derivada y el importe, sin dejar elegir ninguno.
    expect(document.body.textContent).toContain("Seña");
    expect(document.body.textContent).toContain("Total a facturar");
    expect(document.body.textContent).toContain("12.000");

    // El copy nombra importe, porción y la salida real (Nota de crédito).
    expect(document.body.textContent).toContain("Nota de crédito");

    // Sin checkbox: la confirmación queda habilitada de entrada.
    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();
    expect(getButton("Confirmar emisión").disabled).toBe(false);
  });
});

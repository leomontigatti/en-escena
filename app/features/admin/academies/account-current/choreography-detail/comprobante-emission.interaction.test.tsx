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

  test("opens a preview and gates the action behind the irreversible confirmation", async () => {
    await mount({
      billableAmount: 12000,
      canEmit: true,
      currency: null,
      lastComprobante: null,
    });

    expect(document.body.textContent).not.toContain("Total a facturar");

    await clickReactDomButton("Emitir comprobante");

    // El diálogo previsualiza el detalle a facturar y las reglas de dominio.
    expect(document.body.textContent).toContain("Total a facturar");
    expect(document.body.textContent).toContain("Consumidor final");
    expect(document.body.textContent).toContain("Exento de IVA");

    // La emisión arranca deshabilitada hasta confirmar la irreversibilidad.
    expect(getButton("Confirmar emisión").disabled).toBe(true);

    await clickReactDomButton("Confirmo que la emisión es irreversible");

    expect(getButton("Confirmar emisión").disabled).toBe(false);
  });
});

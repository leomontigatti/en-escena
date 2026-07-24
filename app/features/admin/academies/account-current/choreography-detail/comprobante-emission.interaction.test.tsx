/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { EmissionDialog } from "./comprobante-emission";

describe("EmissionDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(props: {
    billableAmount: number;
    porcion: "seña" | "saldo" | "total" | null;
    open: boolean;
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <EmissionDialog
              billableAmount={props.billableAmount}
              porcion={props.porcion}
              open={props.open}
              onOpenChange={() => {}}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("renders nothing while closed", async () => {
    await mount({ billableAmount: 12000, porcion: "seña", open: false });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Total a facturar");
  });

  test("previews the computed portion and amount without letting the operator pick either", async () => {
    await mount({ billableAmount: 12000, porcion: "seña", open: true });

    // La confirmación es un AlertDialog: foco atrapado y anunciable por lectores.
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    // Previsualiza la porción derivada y el importe, sin dejar elegir ninguno.
    expect(document.body.textContent).toContain("Seña");
    expect(document.body.textContent).toContain("Total a facturar");
    expect(document.body.textContent).toContain("12.000");

    // El copy nombra la salida real (nota de crédito, en minúscula dentro de la
    // frase por ser término de dominio).
    expect(document.body.textContent).toMatch(/nota de crédito/i);

    // Sin checkbox: la confirmación queda habilitada de entrada.
    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();
    expect(getButton("Confirmar emisión").disabled).toBe(false);
  });
});

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { EmissionDialog } from "./comprobante-emission";
import {
  recheckComprobanteIntent,
  type ChoreographyFinanceActionData,
} from "./shared";

describe("EmissionDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(props: {
    billableAmount: number;
    porcion: "seña" | "saldo" | "total" | null;
    open: boolean;
    action?: (args: {
      request: Request;
    }) => Promise<ChoreographyFinanceActionData>;
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          action: props.action,
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

  // Responde según el intent: el primer submit deja la contingencia pedida y la
  // re-verificación responde `recovered`.
  function contingencyAction(
    contingency: ChoreographyFinanceActionData["status"] extends never
      ? never
      : Extract<
          ChoreographyFinanceActionData,
          { status: "contingency" }
        >["contingency"],
  ) {
    const recheckPayloads: Array<Record<string, string>> = [];

    return {
      recheckPayloads,
      async action({
        request,
      }: {
        request: Request;
      }): Promise<ChoreographyFinanceActionData> {
        const formData = await request.formData();
        const entries = Object.fromEntries(formData) as Record<string, string>;

        if (entries.intent === recheckComprobanteIntent) {
          recheckPayloads.push(entries);
          return {
            status: "contingency",
            contingency: { status: "recovered" },
          };
        }

        return { status: "contingency", contingency };
      },
    };
  }

  const unverified = {
    status: "unverified",
    message:
      "Se cortó la comunicación con ARCA mientras se autorizaba el comprobante (Factura C 0001-00000043).",
    ptoVta: 1,
    cbteTipo: 11,
    cbteNro: 43,
  } as const;

  test("una emisión sin verificar bloquea el reintento y ofrece las dos salidas", async () => {
    const { action } = contingencyAction(unverified);
    await mount({
      billableAmount: 12000,
      porcion: "seña",
      open: true,
      action,
    });

    await clickReactDomButton("Confirmar emisión");

    expect(document.body.textContent).toContain("Factura C 0001-00000043");
    // Reintentar a ciegas es exactamente como se emite un comprobante duplicado.
    expect(getButton("Confirmar emisión").disabled).toBe(true);
    expect(getButton("Verificar ahora")).not.toBeNull();
    expect(getButton("Ya verifiqué en ARCA")).not.toBeNull();
  });

  test("declarar la verificación manual vuelve a habilitar el reintento", async () => {
    const { action } = contingencyAction(unverified);
    await mount({
      billableAmount: 12000,
      porcion: "seña",
      open: true,
      action,
    });

    await clickReactDomButton("Confirmar emisión");
    await clickReactDomButton("Ya verifiqué en ARCA");

    expect(getButton("Confirmar emisión").disabled).toBe(false);
  });

  test("verificar ahora manda sólo el correlativo y resuelve el alert en el diálogo", async () => {
    const { action, recheckPayloads } = contingencyAction(unverified);
    await mount({
      billableAmount: 12000,
      porcion: "seña",
      open: true,
      action,
    });

    await clickReactDomButton("Confirmar emisión");
    await clickReactDomButton("Verificar ahora");

    // Ni importe ni fecha viajan del cliente (ADR-0012 decisión 4).
    expect(recheckPayloads).toEqual([
      { intent: recheckComprobanteIntent, cbteNro: "43" },
    ]);
    expect(document.body.textContent).toContain("quedó registrado");
    // Recuperado: el submit se saca, no se deshabilita.
    expect(document.querySelector('button[type="submit"]')).toBeNull();
    expect(getButton("Cerrar")).not.toBeNull();
  });

  test("un rechazo de ARCA deja reintentar y muestra los errores crudos", async () => {
    const { action } = contingencyAction({
      status: "rejected",
      message: "ARCA no autorizó el comprobante (CUIT sin habilitar).",
      resultado: "R",
      errors: ["CUIT sin habilitar (código 10016)"],
      observaciones: [],
    });
    await mount({
      billableAmount: 12000,
      porcion: "seña",
      open: true,
      action,
    });

    await clickReactDomButton("Confirmar emisión");

    expect(document.body.textContent).toContain(
      "CUIT sin habilitar (código 10016)",
    );
    expect(getButton("Confirmar emisión").disabled).toBe(false);
  });

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

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

  // It answers by intent: the first submit leaves the requested contingency and
  // the re-verification answers `recovered`.
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
      open: true,
      action,
    });

    await clickReactDomButton("Confirmar emisión");

    expect(document.body.textContent).toContain("Factura C 0001-00000043");
    // Retrying blindly is exactly how a duplicate comprobante gets emitted.
    expect(getButton("Confirmar emisión").disabled).toBe(true);
    expect(getButton("Verificar ahora")).not.toBeNull();
    expect(getButton("Ya verifiqué en ARCA")).not.toBeNull();
  });

  test("declarar la verificación manual vuelve a habilitar el reintento", async () => {
    const { action } = contingencyAction(unverified);
    await mount({
      billableAmount: 12000,
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
      open: true,
      action,
    });

    await clickReactDomButton("Confirmar emisión");
    await clickReactDomButton("Verificar ahora");

    // Neither the amount nor the date travels from the client (ADR-0012
    // decision 4).
    expect(recheckPayloads).toEqual([
      { intent: recheckComprobanteIntent, cbteNro: "43" },
    ]);
    expect(document.body.textContent).toContain("quedó registrado");
    // Recovered: the submit is removed, not disabled.
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
    await mount({ billableAmount: 12000, open: false });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Total a facturar");
  });

  test("previews the computed amount without letting the operator pick it", async () => {
    await mount({ billableAmount: 12000, open: true });

    // The confirmation is an AlertDialog: focus trapped and announceable by screen
    // readers.
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    // It previews the derived amount and offers no control over it. `Porción` is
    // deleted, so there is no second derived field left to preview.
    expect(document.body.textContent).toContain("Total a facturar");
    expect(document.body.textContent).toContain("12.000");
    expect(document.body.textContent).not.toContain("Porción");

    // The copy names the real output (nota de crédito, lowercase inside the
    // sentence because it is a domain term).
    expect(document.body.textContent).toMatch(/nota de crédito/i);

    // No checkbox: the confirmation is enabled from the start.
    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();
    expect(getButton("Confirmar emisión").disabled).toBe(false);
  });
});

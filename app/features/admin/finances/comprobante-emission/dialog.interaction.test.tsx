/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  getButton,
} from "@/lib/test-support/react-dom";

import { EmissionDialog } from "./dialog";
import {
  abandonReservationIntent,
  emitComprobanteIntent,
  recheckComprobanteIntent,
  type AnchorInvoicing,
  type ComprobanteEmissionActionData,
} from "./shared";
import { readyInvoicing } from "./shared.test-support";

/** The dialog's verb, apart from the page's own `Emitir Factura C`. */
function emitButton() {
  const button = findButton("Emitir", {
    exact: true,
    within: document.querySelector('[role="alertdialog"]'),
  });

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected the dialog\'s "Emitir" to be rendered.');
  }

  return button;
}

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("EmissionDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(props: {
    invoicing?: Extract<AnchorInvoicing, { status: "ready" }>;
    open: boolean;
    action?: (args: {
      request: Request;
    }) => Promise<ComprobanteEmissionActionData>;
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          action: props.action,
          element: (
            <EmissionDialog
              invoicing={props.invoicing ?? readyInvoicing("factura_c", 12000)}
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

  // It answers by intent: the first submit leaves the requested contingency,
  // the re-verification answers `recovered` and the abandonment `released`.
  function contingencyAction(
    contingency: ComprobanteEmissionActionData["status"] extends never
      ? never
      : Extract<
          ComprobanteEmissionActionData,
          { status: "warning" }
        >["contingency"],
  ) {
    const recheckPayloads: Array<Record<string, string>> = [];
    const emitPayloads: Array<Record<string, string>> = [];

    return {
      emitPayloads,
      recheckPayloads,
      async action({
        request,
      }: {
        request: Request;
      }): Promise<ComprobanteEmissionActionData> {
        const formData = await request.formData();
        const entries = Object.fromEntries(formData) as Record<string, string>;

        if (entries.intent === recheckComprobanteIntent) {
          recheckPayloads.push(entries);
          return {
            status: "warning",
            contingency: { status: "recovered" },
          };
        }

        if (entries.intent === abandonReservationIntent) {
          recheckPayloads.push(entries);
          return { status: "warning", contingency: { status: "released" } };
        }

        emitPayloads.push(entries);
        return { status: "warning", contingency };
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

  test("an unverified emission blocks the retry and offers both ways out", async () => {
    const { action } = contingencyAction(unverified);
    await mount({
      open: true,
      action,
    });

    await clickReactDomButton("Emitir", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    expect(document.body.textContent).toContain("Factura C 0001-00000043");
    // Retrying blindly is exactly how a duplicate comprobante gets emitted.
    expect(emitButton().disabled).toBe(true);
    expect(getButton("Verificar ahora")).not.toBeNull();
    expect(getButton("Ya verifiqué en ARCA")).not.toBeNull();
  });

  // The operator's verification is not a client-side flag any more: the series
  // stays held until the server lets the reservation go.
  test("declaring manual verification abandons the attempt on the server, and only then re-enables the retry", async () => {
    const { action, recheckPayloads } = contingencyAction(unverified);
    await mount({
      open: true,
      action,
    });

    await clickReactDomButton("Emitir", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });
    await clickReactDomButton("Ya verifiqué en ARCA");

    expect(recheckPayloads).toEqual([
      { intent: abandonReservationIntent, cbteTipo: "11", cbteNro: "43" },
    ]);
    expect(document.body.textContent).toContain("su serie quedó libre");
    expect(emitButton().disabled).toBe(false);
  });

  test("the emission carries the comprobante's date, today unless the operator moves it", async () => {
    const { action, emitPayloads } = contingencyAction(unverified);
    await mount({ open: true, action });

    expect(document.body.textContent).toContain("Fecha del comprobante");
    expect(document.body.textContent).toContain("Desde el 12/07/2026");

    await clickReactDomButton("Emitir", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    expect(emitPayloads).toEqual([
      expect.objectContaining({
        intent: emitComprobanteIntent,
        kind: "factura_c",
        amount: "12000",
        cbteFch: "2026-07-22",
      }),
    ]);
  });

  test("verify now sends only the sequence number and resolves the alert inside the dialog", async () => {
    const { action, recheckPayloads } = contingencyAction(unverified);
    await mount({
      open: true,
      action,
    });

    await clickReactDomButton("Emitir", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });
    await clickReactDomButton("Verificar ahora");

    // Neither the amount nor the date travels from the client (ADR-0012
    // decision 4).
    expect(recheckPayloads).toEqual([
      { intent: recheckComprobanteIntent, cbteTipo: "11", cbteNro: "43" },
    ]);
    expect(document.body.textContent).toContain("quedó registrado");
    // Recovered: the submit is removed, not disabled.
    expect(document.querySelector('button[type="submit"]')).toBeNull();
    expect(getButton("Cerrar")).not.toBeNull();
  });

  test("an ARCA rejection allows a retry and shows the raw errors", async () => {
    const { action } = contingencyAction({
      status: "rejected",
      message: "ARCA no autorizó el comprobante (CUIT sin habilitar).",
      resultado: "R",
      errors: ["CUIT sin habilitar (código 10016)"],
      observaciones: [],
    });
    await mount({
      open: true,
      action,
    });

    await clickReactDomButton("Emitir", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    expect(document.body.textContent).toContain(
      "CUIT sin habilitar (código 10016)",
    );
    expect(emitButton().disabled).toBe(false);
  });

  // A refusal that is neither a contingency nor ARCA's is the server's word,
  // so it is a toast, and the dialog stays open to retry.
  test("toasts a refused emission and keeps the dialog open", async () => {
    await mount({
      open: true,
      action: async () => ({
        status: "error",
        message: "No hay nada para facturar.",
      }),
    });

    await clickReactDomButton("Emitir", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(toastError).toHaveBeenCalledWith("No hay nada para facturar.", {
      id: "comprobante-emission:error",
    });
    expect(document.body.textContent).not.toContain(
      "No hay nada para facturar.",
    );
    expect(emitButton().disabled).toBe(false);
  });

  test("renders nothing while closed", async () => {
    await mount({ open: false });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Total a facturar");
  });

  test("previews the computed amount without letting the operator pick it", async () => {
    await mount({ open: true });

    // The confirmation is an AlertDialog: focus trapped and announceable by screen
    // readers.
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    // It previews the derived amount and offers no control over it. `Porción` is
    // deleted, so there is no second derived field left to preview.
    expect(document.body.textContent).toContain("Total a facturar");
    expect(document.body.textContent).toContain("12.000");
    expect(document.body.textContent).not.toContain("Porción");

    // The copy names the real output (credit note, lowercase inside the
    // sentence because it is a domain term).
    expect(document.body.textContent).toMatch(/nota de crédito/i);

    // No checkbox: the confirmation is enabled from the start.
    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();
    expect(emitButton().disabled).toBe(false);
  });
});

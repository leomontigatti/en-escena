/** @vitest-environment jsdom */

import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

import { ComprobanteDetailRouteView } from "./view";
import type { ComprobanteDetail, ComprobanteDetailLoaderData } from "./server";
import {
  annulComprobanteIntent,
  recheckNotaCreditoIntent,
  type ComprobanteDetailActionData,
} from "./shared";

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

// A route with a real loader, so the fetcher's revalidation shows up in the view.
function LoadedComprobanteDetail() {
  const loaderData = useLoaderData() as ComprobanteDetailLoaderData;

  return (
    <ComprobanteDetailRouteView
      initialAnnulDialogOpen
      loaderData={loaderData}
    />
  );
}

describe("ComprobanteDetailRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(props: {
    comprobante?: Partial<ComprobanteDetail>;
    initialAnnulDialogOpen?: boolean;
    action?: (args: {
      request: Request;
    }) => Promise<ComprobanteDetailActionData>;
  }) {
    const view = (
      <ComprobanteDetailRouteView
        initialAnnulDialogOpen={props.initialAnnulDialogOpen}
        loaderData={{ comprobante: comprobanteFixture(props.comprobante) }}
      />
    );
    const router = createMemoryRouter(
      [{ path: "/", element: view, action: props.action }],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  // The annulment leaves the nota de crédito unresolved; the re-verification
  // recovers it.
  function unverifiedThenRecovered() {
    const recheckPayloads: Array<Record<string, string>> = [];

    return {
      recheckPayloads,
      async action({
        request,
      }: {
        request: Request;
      }): Promise<ComprobanteDetailActionData> {
        const entries = Object.fromEntries(await request.formData()) as Record<
          string,
          string
        >;

        if (entries.intent === recheckNotaCreditoIntent) {
          recheckPayloads.push(entries);
          return {
            status: "contingency",
            contingency: { status: "recovered" },
          };
        }

        return {
          status: "contingency",
          contingency: {
            status: "unverified",
            message:
              "Se cortó la comunicación con ARCA mientras se autorizaba la nota de crédito (Nota de crédito C 0001-00000008).",
            ptoVta: 1,
            cbteTipo: 13,
            cbteNro: 8,
          },
        };
      },
    };
  }

  test("an unverified annulment blocks the retry and names the nota de crédito", async () => {
    const { action } = unverifiedThenRecovered();
    await mount({ initialAnnulDialogOpen: true, action });

    await clickReactDomButton("Anular comprobante");

    expect(document.body.textContent).toContain(
      "Nota de crédito C 0001-00000008",
    );
    expect(getButton("Anular comprobante").disabled).toBe(true);
  });

  test("verify now recovers the nota de crédito and removes the annul button", async () => {
    const { action, recheckPayloads } = unverifiedThenRecovered();
    await mount({ initialAnnulDialogOpen: true, action });

    await clickReactDomButton("Anular comprobante");
    await clickReactDomButton("Verificar ahora");

    // Only the sequence number travels from the client (ADR-0012 decision 4).
    expect(recheckPayloads).toEqual([
      { intent: recheckNotaCreditoIntent, cbteNro: "8" },
    ]);
    expect(document.body.textContent).toContain("quedó registrado");
    // The operation is over: the submit is removed, not disabled.
    expect(document.querySelector('button[type="submit"]')).toBeNull();
    expect(getButton("Cerrar")).not.toBeNull();
  });

  /**
   * Regression: recovering the nota de crédito persists it, so the revalidation
   * the fetcher triggers returns the comprobante already annulled and `canAnnul`
   * at `false`. With the dialog mounted off that flag, the `recovered` state
   * disappeared in the same tick it was produced and the operator never saw it.
   * The dialog unmounts when it is closed, not when it loses the affordance
   * (#577).
   */
  test("the recovered state survives the revalidation that leaves the comprobante annulled", async () => {
    const { action } = unverifiedThenRecovered();
    let annulled = false;

    const router = createMemoryRouter(
      [
        {
          path: "/",
          loader: () => ({
            comprobante: comprobanteFixture({
              canAnnul: !annulled,
              status: annulled ? "anulada" : "vigente",
            }),
          }),
          async action(args: { request: Request }) {
            const data = await action(args);

            if (
              data.status === "contingency" &&
              data.contingency.status === "recovered"
            ) {
              annulled = true;
            }

            return data;
          },
          Component: LoadedComprobanteDetail,
          HydrateFallback: () => null,
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickReactDomButton("Anular comprobante");
    await clickReactDomButton("Verificar ahora");

    expect(document.body.textContent).toContain("quedó registrado");
    expect(getButton("Cerrar")).not.toBeNull();
  });

  test("declaring the manual verification re-enables the annulment", async () => {
    const { action } = unverifiedThenRecovered();
    await mount({ initialAnnulDialogOpen: true, action });

    await clickReactDomButton("Anular comprobante");
    await clickReactDomButton("Ya verifiqué en ARCA");

    expect(getButton("Anular comprobante").disabled).toBe(false);
  });

  test("renders the comprobante data and the actions menu", async () => {
    await mount({});

    // Data from the fiscal snapshot.
    expect(document.body.textContent).toContain("0001-00000041");
    expect(document.body.textContent).toContain("Factura C");
    expect(document.body.textContent).toContain("Academia Centro");
    expect(document.body.textContent).toContain("Aire");
    // `porcion` is deleted, so the detail no longer carries a `Porción` field.
    expect(document.body.textContent).not.toContain("Porción");

    // Actions menu (print/annul) hosted in the header.
    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();

    // The annulment dialog is not mounted until it is opened.
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  test("confirms annulment through an alertdialog without a checkbox", async () => {
    await mount({ initialAnnulDialogOpen: true });

    // The confirmation is an AlertDialog: focus trapped and announceable by
    // screen readers.
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    // The copy says what is being annulled, for how much, and the real output
    // (Nota de crédito).
    expect(document.body.textContent).toContain("0001-00000041");
    expect(document.body.textContent).toContain("7.000");
    expect(document.body.textContent).toMatch(/nota de crédito/i);

    // No checkbox: the confirmation is the dialog itself.
    expect(document.body.querySelector('input[type="checkbox"]')).toBeNull();

    // The annulment intent travels in the form.
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
    // With no comprobante in force there is no possible annulment: neither dialog
    // nor action.
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});

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

// Ruta con loader real, para que la revalidación del fetcher se vea en la vista.
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

  // La anulación deja la nota de crédito sin resolver; la re-verificación la
  // recupera.
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

  test("una anulación sin verificar bloquea el reintento y nombra la nota de crédito", async () => {
    const { action } = unverifiedThenRecovered();
    await mount({ initialAnnulDialogOpen: true, action });

    await clickReactDomButton("Anular comprobante");

    expect(document.body.textContent).toContain(
      "Nota de crédito C 0001-00000008",
    );
    expect(getButton("Anular comprobante").disabled).toBe(true);
  });

  test("verificar ahora recupera la nota de crédito y saca el botón de anular", async () => {
    const { action, recheckPayloads } = unverifiedThenRecovered();
    await mount({ initialAnnulDialogOpen: true, action });

    await clickReactDomButton("Anular comprobante");
    await clickReactDomButton("Verificar ahora");

    // Del cliente sólo viaja el correlativo (ADR-0012 decisión 4).
    expect(recheckPayloads).toEqual([
      { intent: recheckNotaCreditoIntent, cbteNro: "8" },
    ]);
    expect(document.body.textContent).toContain("quedó registrado");
    // La operación terminó: el submit se saca, no se deshabilita.
    expect(document.querySelector('button[type="submit"]')).toBeNull();
    expect(getButton("Cerrar")).not.toBeNull();
  });

  /**
   * Regresión: recuperar la nota de crédito la persiste, así que la
   * revalidación que dispara el fetcher devuelve el comprobante ya anulado y
   * `canAnnul` en `false`. Con el diálogo montado según esa bandera, el estado
   * `recovered` desaparecía en el mismo tick en que se producía y el operador
   * nunca lo veía. El diálogo se desmonta al cerrarlo, no al perder la
   * afordancia (#577).
   */
  test("el estado recuperado sobrevive a la revalidación que deja el comprobante anulado", async () => {
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

  test("declarar la verificación manual vuelve a habilitar la anulación", async () => {
    const { action } = unverifiedThenRecovered();
    await mount({ initialAnnulDialogOpen: true, action });

    await clickReactDomButton("Anular comprobante");
    await clickReactDomButton("Ya verifiqué en ARCA");

    expect(getButton("Anular comprobante").disabled).toBe(false);
  });

  test("renders the comprobante data and the actions menu", async () => {
    await mount({});

    // Datos del snapshot fiscal.
    expect(document.body.textContent).toContain("0001-00000041");
    expect(document.body.textContent).toContain("Factura C");
    expect(document.body.textContent).toContain("Academia Centro");
    expect(document.body.textContent).toContain("Aire");
    // `porcion` is deleted, so the detail no longer carries a `Porción` field.
    expect(document.body.textContent).not.toContain("Porción");

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

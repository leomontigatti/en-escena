/** @vitest-environment jsdom */

import { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { ChoreographyFinanceDetailView } from "./view";
import type { loadChoreographyFinanceDetail } from "./server";

// El loader devuelve una unión: sin evento activo no hay coreografía. Las
// fixtures modelan siempre la rama con evento.
type ChoreographyFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadChoreographyFinanceDetail>>,
  { selectedEventId: string }
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type ChoreographyRow = NonNullable<
  ChoreographyFinanceDetailLoaderData["choreography"]
>;

describe("ChoreographyFinanceDetailView", () => {
  test("renders readonly finance cards, choreography fields, and inscriptions with state", () => {
    const markup = renderDetail();

    expect(markup).toContain("Detalle financiero");
    expect(markup).toContain("Estado");
    expect(markup).toContain("Señada");
    expect(markup).toContain('value="Academia Centro"');
    expect(markup).toContain('value="Aire"');
    expect(markup).toContain('value="Dúo"');
    expect(markup).toContain("Bailarín");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Seña");
    expect(markup).toContain("Saldo");
    expect(markup).toContain("Ana López");
  });

  test("replaces the status badge with Retirada and the retained amount", () => {
    const markup = renderDetail({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 3000,
          financialStatus: "paidInFull",
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
          totalAmount: 3000,
          withdrawn: true,
        }),
      ],
    });

    // It replaces the status rather than accompanying it, and it carries the
    // retained money with it.
    expect(markup).toContain("Retirada · $ 3.000");
    expect(markup).not.toContain("Pagada");
  });

  test("carries no comprobante badge or link on the amount cards", () => {
    // `porcion` is deleted, and with it the two `Vigente`/`Desactualizada`
    // badges the Seña and Saldo cards carried: each read *a portion* — which
    // vigente factura covered it, and whether new money had landed inside it —
    // and with no portion there is nothing to cover. The surviving
    // `Vigente`/`Anulada` badge is the comprobante's own status, and it lives on
    // the global comprobante list and detail.
    const markup = renderDetail();

    for (const title of ["Seña", "Saldo adeudado", "Total"]) {
      const card = amountCard(markup, title);
      expect(card.textContent).not.toContain("Vigente");
      expect(card.textContent).not.toContain("Desactualizada");
      expect(card.querySelector("a")).toBeNull();
    }

    expect(markup).not.toContain("/administracion/comprobantes/");
  });

  test("sums the deposit and balance into the Total card", () => {
    // depositAmount 3000 + balanceAmount 7000 = 10.000.
    const markup = renderDetail();

    const card = amountCard(markup, "Total");
    expect(card.textContent).toContain("10.000");
  });

  test("turns every inscription's name into the entry point for its money", () => {
    const markup = renderDetail({
      inscriptions: [
        inscriptionFixture({
          firstName: "Bruno",
          lastName: "Benítez",
        }),
      ],
    });

    expect(markup).toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
  });

  test("leaves a dancer without an inscription as plain text", () => {
    const markup = renderDetail({
      inscriptions: [
        inscriptionFixture({
          firstName: "Bruno",
          inscriptionId: null,
          lastName: "Benítez",
          selectedPrice: null,
        }),
      ],
    });

    expect(markup).not.toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
    expect(markup).toContain("Bruno Benítez");
  });

  test("keeps every price control out of the table", () => {
    const markup = renderDetail();

    const table = new DOMParser()
      .parseFromString(markup, "text/html")
      .querySelector('[aria-label="Inscripciones"] table');
    expect(table?.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(table?.textContent).not.toContain("Precio base · ");
  });

  test("names the shortfall of an inscription holding part of its seña", () => {
    const markup = renderDetail({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 2700,
          financialStatus: "depositPending",
          owedBalanceAmount: 17500,
          owedDepositAmount: 300,
        }),
      ],
    });

    // Lee `Seña pendiente` con el faltante a la vista, no como impaga.
    expect(markup).toContain("Seña pendiente");
    expect(markup).toContain("$ 17.500");
  });

  test("styles the amount columns by column and never by row", () => {
    const pending = amountColumnStyles(
      renderDetail({
        inscriptions: [
          inscriptionFixture({ financialStatus: "depositPending" }),
        ],
      }),
    );
    const paid = amountColumnStyles(
      renderDetail({
        inscriptions: [inscriptionFixture({ financialStatus: "paidInFull" })],
      }),
    );

    // Ninguna cifra es provisoria, así que el estilo no puede variar con el
    // estado: si variara, el gris volvería a significar algo.
    expect(pending).toEqual(paid);
    // Lo que queda es decoración fija: `Total` es contexto, `Saldo adeudado` es
    // la única cifra accionable.
    expect(pending).toEqual({
      "Precio base": { emphasised: false, muted: false },
      Seña: { emphasised: false, muted: false },
      Total: { emphasised: false, muted: true },
      "Saldo adeudado": { emphasised: true, muted: false },
    });
  });

  test("does not label any amount as provisional", () => {
    const markup = renderDetail({
      inscriptions: [inscriptionFixture({ financialStatus: "depositPending" })],
    });

    expect(markup).not.toContain("provisori");
    expect(markup).not.toContain("estimad");
    expect(markup).not.toContain("tentativ");
  });

  test("alerts about the over-allocation without a title and without naming dancers", () => {
    const alert = anomalyAlert(
      renderDetail({
        choreography: choreographyFixture({
          anomalies: ["overAllocated"],
          overAllocatedAmount: 2000,
        }),
      }),
    );

    expect(alert.textContent).toContain(
      "Hay inscripciones con más dinero asignado que su total",
    );
    // Genérica: sin título, y sin enumerar bailarines ni contarlos.
    expect(alert.querySelector('[data-slot="alert-title"]')).toBeNull();
    expect(alert.textContent).not.toContain("Ana López");
    expect(alert.textContent).not.toContain("$");
  });

  test("shows no anomaly alert when nothing is over-allocated", () => {
    const markup = renderDetail();

    expect(markup).not.toContain("más dinero asignado que su total");
  });

  test("warns when the deposit has no configured price", () => {
    const markup = renderDetail({
      choreography: choreographyFixture({
        depositAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
      }),
    });

    expect(markup).toContain("no tiene un precio configurado");
  });
});

/**
 * Mapea cada columna de importe de la fila de inscripción a su decoración. Se
 * ancla en el encabezado de la columna, no en su posición, para que el test
 * hable de "Saldo adeudado" y no de "la celda 5".
 */
function amountColumnStyles(markup: string) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const table = document.querySelector('[aria-label="Inscripciones"] table');
  const headers = [...(table?.querySelectorAll("thead th") ?? [])].map(
    (header) => header.textContent?.trim() ?? "",
  );
  const cells = [...(table?.querySelectorAll("tbody tr td") ?? [])];

  return Object.fromEntries(
    ["Precio base", "Seña", "Total", "Saldo adeudado"].map((column) => {
      const cell = cells[headers.indexOf(column)];

      if (!cell) {
        throw new Error(`No se encontró la columna "${column}".`);
      }

      return [
        column,
        {
          emphasised: cell.classList.contains("font-medium"),
          muted: cell.classList.contains("text-muted-foreground"),
        },
      ];
    }),
  );
}

/** La alerta de anomalía del detalle, ubicada por su variante `destructive`. */
function anomalyAlert(markup: string): Element {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const alert = [...document.querySelectorAll('[data-slot="alert"]')].find(
    (candidate) => candidate.className.split(" ").includes("text-destructive"),
  );

  if (!alert) {
    throw new Error("No se encontró la alerta de anomalía.");
  }

  return alert;
}

/**
 * An amount MetricCard, located by its title rather than its position so the
 * test can talk about "Seña" / "Saldo" / "Total".
 */
function amountCard(markup: string, title: string): Element {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const card = [...document.querySelectorAll('[data-slot="card"]')].find(
    (element) =>
      element.querySelector('[data-slot="card-title"]')?.textContent?.trim() ===
      title,
  );

  if (!card) {
    throw new Error(`No se encontró la MetricCard "${title}".`);
  }

  return card;
}

/**
 * Renderiza con un data router porque el diálogo de cobro usa `useFetcher`, que
 * no funciona con un router de memoria a secas.
 */
function renderDetail(
  overrides: Partial<ChoreographyFinanceDetailLoaderData> = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <ChoreographyFinanceDetailView
            loaderData={loaderDataFixture(overrides)}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function loaderDataFixture(
  overrides: Partial<ChoreographyFinanceDetailLoaderData> = {},
): ChoreographyFinanceDetailLoaderData {
  return {
    academy: {
      contactName: "Academia Centro",
      id: "academy_1",
      name: "Academia Centro",
      phone: "11-5555-5555",
    },
    choreography: choreographyFixture(),
    inscriptions: [inscriptionFixture({ financialStatus: "depositMet" })],
    invoicing: invoicingFixture(),
    priceOptions: [
      {
        amount: 10000,
        depositAmount: 3000,
        id: "price_1",
        name: "Dúo general",
      },
    ],
    selectedEventId: "event_1",
    ...overrides,
  };
}

function invoicingFixture(
  overrides: Partial<ChoreographyFinanceDetailLoaderData["invoicing"]> = {},
): ChoreographyFinanceDetailLoaderData["invoicing"] {
  return {
    billableAmount: 0,
    canEmit: false,
    ...overrides,
  };
}

function choreographyFixture(
  overrides: Partial<ChoreographyRow> = {},
): ChoreographyRow {
  return {
    allocatedAmount: 3000,
    anomalies: [],
    depositAmount: { amount: 3000, status: "complete" },
    financialStatus: "depositMet",
    groupType: "duo",
    id: "choreography_1",
    name: "Aire",
    overAllocatedAmount: 0,
    owedBalanceAmount: { amount: 7000, status: "complete" },
    owedDepositAmount: { amount: 0, status: "complete" },
    totalAmount: { amount: 10000, status: "complete" },
    ...overrides,
  };
}

function inscriptionFixture(
  overrides: Partial<InscriptionRow> = {},
): InscriptionRow {
  return {
    allocatedAmount: 3000,
    anomalies: [],
    basePriceAmount: 10000,
    dancerId: "dancer_1",
    depositAmount: 3000,
    discountAmount: 0,
    effectivePrice: { amount: 10000, id: "price_1", name: "Dúo general" },
    financialStatus: "depositMet",
    firstName: "Ana",
    inscriptionId: "inscription_1",
    lastName: "López",
    overAllocatedAmount: 0,
    owedBalanceAmount: 7000,
    owedDepositAmount: 0,
    selectedPrice: { amount: 10000, id: "price_1", name: "Dúo general" },
    totalAmount: 10000,
    withdrawn: false,
    ...overrides,
  };
}

describe("ChoreographyFinanceDetailView actions menu", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(
    overrides: Partial<ChoreographyFinanceDetailLoaderData> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <ChoreographyFinanceDetailView
              loaderData={loaderDataFixture(overrides)}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("omits the actions menu when there is nothing to emit or charge", async () => {
    await mount();

    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();
  });

  test("offers Emitir factura inside the actions menu, not as a standalone button", async () => {
    await mount({
      invoicing: invoicingFixture({
        billableAmount: 12000,
        canEmit: true,
      }),
    });

    // Cerrado, la afordancia no es un botón suelto: vive detrás del menú `...`.
    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();

    await openActionsMenu();

    const item = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((candidate) => candidate.textContent?.includes("Emitir factura"));
    expect(item).not.toBeUndefined();
  });

  /**
   * Regresión: recuperar la emisión por "Verificar ahora" persiste el
   * comprobante, así que la revalidación devuelve la coreografía ya facturada y
   * `canEmit` en `false`. Con el diálogo montado según esa bandera, el estado
   * `recovered` se desmontaba en el mismo tick en que se producía y el operador
   * nunca lo veía. El facturable se congela al abrir y el diálogo se desmonta al
   * cerrarlo, no al perder la afordancia (#577).
   */
  test("el diálogo de emisión sobrevive a que la coreografía deje de ser facturable", async () => {
    function Wrapper() {
      const [billable, setBillable] = useState(true);

      return (
        <>
          <button
            type="button"
            aria-label="revalidar"
            onClick={() => setBillable(false)}
          >
            revalidar
          </button>
          <ChoreographyFinanceDetailView
            loaderData={loaderDataFixture({
              invoicing: invoicingFixture({
                billableAmount: 12000,
                canEmit: billable,
              }),
            })}
          />
        </>
      );
    }

    const router = createMemoryRouter([{ path: "/", element: <Wrapper /> }], {
      initialEntries: ["/"],
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await openActionsMenu();
    await clickMenuItem("Emitir factura");
    expect(document.body.textContent).toContain("Confirmar emisión");

    await clickReactDomButton("revalidar");

    // El preview sigue mostrando el importe congelado al abrir, no un $ 0.
    expect(document.body.textContent).toContain("Confirmar emisión");
    expect(document.body.textContent).toContain("12.000");
  });
});

async function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!item) {
    throw new Error(`Expected the "${label}" menu item to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function openActionsMenu() {
  const button = document.querySelector('button[aria-label="Acciones"]');

  if (!button) {
    throw new Error("Expected the actions menu button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    ctrlKey: false,
  });
  Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

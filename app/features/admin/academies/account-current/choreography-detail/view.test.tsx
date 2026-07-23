/** @vitest-environment jsdom */

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AdministracionCoreografiaFinancieraDetalleView } from "./view";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";

// El loader devuelve una unión: sin evento activo no hay coreografía. Las
// fixtures modelan siempre la rama con evento.
type ChoreographyFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>>,
  { selectedEventId: string }
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type PaymentRow = ChoreographyFinanceDetailLoaderData["payments"][number];
type ChoreographyRow = NonNullable<
  ChoreographyFinanceDetailLoaderData["choreography"]
>;

describe("AdministracionCoreografiaFinancieraDetalleView", () => {
  test("renders readonly finance cards, choreography fields, and inscriptions with state", () => {
    const markup = renderDetail();

    expect(markup).toContain("Detalle financiero");
    expect(markup).toContain("Estado");
    expect(markup).toContain("Señada");
    expect(markup).toContain('value="Academia Centro"');
    expect(markup).toContain('value="Aire"');
    expect(markup).toContain('value="Dúo"');
    expect(markup).toContain("21 de marzo de 2026");
    expect(markup).toContain("Bailarín");
    expect(markup).toContain("Precio base");
    expect(markup).toContain("Seña");
    expect(markup).toContain("Saldo");
    expect(markup).toContain("Ana López");
  });

  test("shows a Vigente badge and a link to the covering comprobante on the Seña card", () => {
    const markup = renderDetail({
      invoicing: invoicingFixture({
        sena: { comprobanteId: "comprobante_sena", currency: "vigente" },
      }),
    });

    const card = portionCard(markup, "Seña");
    expect(card.textContent).toContain("Vigente");
    expect(
      card.querySelector(
        'a[href="/administracion/comprobantes/comprobante_sena"]',
      ),
    ).not.toBeNull();
  });

  test("links Seña and Saldo to the same comprobante when a total factura covers both", () => {
    const markup = renderDetail({
      invoicing: invoicingFixture({
        sena: { comprobanteId: "comprobante_total", currency: "vigente" },
        saldo: { comprobanteId: "comprobante_total", currency: "vigente" },
      }),
    });

    const sena = portionCard(markup, "Seña");
    const saldo = portionCard(markup, "Saldo");
    const target = 'a[href="/administracion/comprobantes/comprobante_total"]';
    expect(sena.querySelector(target)).not.toBeNull();
    expect(saldo.querySelector(target)).not.toBeNull();
  });

  test("marks a portion card Desactualizada when new money is unbilled", () => {
    const markup = renderDetail({
      invoicing: invoicingFixture({
        saldo: {
          comprobanteId: "comprobante_saldo",
          currency: "desactualizada",
        },
      }),
    });

    const card = portionCard(markup, "Saldo");
    expect(card.textContent).toContain("Desactualizada");
    expect(card.textContent).not.toContain("Vigente");
  });

  test("drops the badge and link from a portion card whose comprobante was annulled", () => {
    // El loader ya filtra las facturas anuladas: la vista sólo recibe cobertura
    // `null`, así que la MetricCard no muestra badge ni botón (sin estado Anulado).
    const markup = renderDetail({
      invoicing: invoicingFixture({ sena: null, saldo: null }),
    });

    const card = portionCard(markup, "Seña");
    expect(card.textContent).not.toContain("Vigente");
    expect(card.textContent).not.toContain("Desactualizada");
    expect(markup).not.toContain("/administracion/comprobantes/");
  });

  test("carries no badge or link on the Total card", () => {
    const markup = renderDetail({
      invoicing: invoicingFixture({
        sena: { comprobanteId: "comprobante_sena", currency: "vigente" },
        saldo: { comprobanteId: "comprobante_saldo", currency: "vigente" },
      }),
    });

    const card = portionCard(markup, "Total");
    expect(card.textContent).not.toContain("Vigente");
    expect(card.querySelector("a")).toBeNull();
  });

  test("sums the deposit and balance into the Total card", () => {
    // depositAmount 3000 + balanceAmount 7000 = 10.000 (ambas porciones completas).
    const markup = renderDetail();

    const card = portionCard(markup, "Total");
    expect(card.textContent).toContain("10.000");
  });

  test("renders a clickable name for an orphan impaga in a mixed choreography", () => {
    const markup = renderDetail({
      inscriptionDeposit: {
        floor: 10000,
        priceRows: [
          {
            id: "price_1",
            name: "Solo tardío",
            amount: 12000,
            depositAmount: 3600,
          },
        ],
      },
      inscriptions: [
        inscriptionFixture({
          state: "impaga",
          inscriptionId: "inscription_orphan",
          firstName: "Bruno",
          lastName: "Benítez",
        }),
      ],
    });

    expect(markup).toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
  });

  test("does not link an impaga inscription in a fully impaga choreography", () => {
    const markup = renderDetail({
      inscriptionDeposit: null,
      inscriptions: [
        inscriptionFixture({
          state: "impaga",
          inscriptionId: "inscription_orphan",
          firstName: "Bruno",
          lastName: "Benítez",
        }),
      ],
    });

    expect(markup).not.toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
    expect(markup).toContain("Bruno Benítez");
  });

  test("renders a clickable name for an orphan señada in a mixed choreography", () => {
    const markup = renderDetail({
      canPayInscriptionBalance: true,
      inscriptions: [
        inscriptionFixture({
          state: "señada",
          inscriptionId: "inscription_orphan",
          firstName: "Bruno",
          lastName: "Benítez",
        }),
      ],
    });

    expect(markup).toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
  });

  test("does not link a señada inscription in a uniform choreography", () => {
    const markup = renderDetail({
      canPayInscriptionBalance: false,
      inscriptions: [
        inscriptionFixture({
          state: "señada",
          inscriptionId: "inscription_orphan",
          firstName: "Bruno",
          lastName: "Benítez",
        }),
      ],
    });

    expect(markup).not.toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
    expect(markup).toContain("Bruno Benítez");
  });

  test("links a señada inscription in a uniform choreography when it can be undone", () => {
    const markup = renderDetail({
      canPayInscriptionBalance: false,
      inscriptions: [
        inscriptionFixture({
          state: "señada",
          inscriptionId: "inscription_orphan",
          firstName: "Bruno",
          lastName: "Benítez",
          undoableAllocation: { id: "allocation_1", stage: "deposit" },
        }),
      ],
    });

    expect(markup).toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
  });

  test("links a pagada inscription that has an allocation to undo", () => {
    const markup = renderDetail({
      canPayInscriptionBalance: false,
      inscriptions: [
        inscriptionFixture({
          state: "pagada",
          inscriptionId: "inscription_paid",
          firstName: "Bruno",
          lastName: "Benítez",
          undoableAllocation: { id: "allocation_2", stage: "balance" },
        }),
      ],
    });

    expect(markup).toMatch(/<button[^>]*>Bruno Benítez<\/button>/);
  });

  test("shows the saldo of an impaga inscription instead of zero", () => {
    const markup = renderDetail({
      inscriptions: [
        inscriptionFixture({ state: "impaga", balanceAmount: 17500 }),
      ],
    });

    expect(markup).toContain("$ 17.500");
  });

  test("marks every amount of an impaga inscription as tentative", () => {
    const markup = renderDetail({
      inscriptions: [inscriptionFixture({ state: "impaga" })],
    });

    expect(tentativeAmounts(markup)).toEqual({
      "Precio base": true,
      Seña: true,
      Saldo: true,
    });
  });

  test("marks only the saldo of a señada inscription as tentative", () => {
    const markup = renderDetail({
      inscriptions: [inscriptionFixture({ state: "señada" })],
    });

    // Precio base y seña quedan fijos al pagar la seña; el saldo sigue
    // moviéndose hasta que se congela el descuento por bailarín.
    expect(tentativeAmounts(markup)).toEqual({
      "Precio base": false,
      Seña: false,
      Saldo: true,
    });
  });

  test("marks no amount of a pagada inscription as tentative", () => {
    const markup = renderDetail({
      inscriptions: [inscriptionFixture({ state: "pagada" })],
    });

    expect(tentativeAmounts(markup)).toEqual({
      "Precio base": false,
      Seña: false,
      Saldo: false,
    });
  });

  test("does not warn when a payment covers the stage total of its own date", () => {
    // El total viene cotizado a la fecha del pago, así que un pago fechado antes
    // de un aumento alcanza aunque el precio que se muestra hoy sea mayor.
    const markup = renderDetail({
      stage: "deposit",
      payments: [
        paymentFixture({ availableAmount: 2400, stageTotalAmount: 2400 }),
      ],
    });

    expect(markup).not.toContain(
      "saldo suficiente para cubrir la seña completa",
    );
  });

  test("warns when no payment covers the stage total of its own date", () => {
    const markup = renderDetail({
      stage: "deposit",
      payments: [
        paymentFixture({ availableAmount: 2400, stageTotalAmount: 3000 }),
      ],
    });

    expect(markup).toContain("saldo suficiente para cubrir la seña completa");
  });

  test("warns about the saldo when no payment covers the balance stage", () => {
    const markup = renderDetail({
      stage: "balance",
      payments: [
        paymentFixture({ availableAmount: 2400, stageTotalAmount: 3000 }),
      ],
    });

    expect(markup).toContain("saldo suficiente para cubrir el saldo completo");
  });

  test("warns when the stage total is unknown because that date has no price", () => {
    const markup = renderDetail({
      stage: "deposit",
      payments: [paymentFixture({ stageTotalAmount: null })],
    });

    expect(markup).toContain("saldo suficiente para cubrir la seña completa");
  });

  test("blames the missing price instead of the payments when the deposit has no configured price", () => {
    const markup = renderDetail({
      stage: "deposit",
      choreography: choreographyFixture({
        depositAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
      }),
      payments: [paymentFixture({ stageTotalAmount: null })],
    });

    expect(markup).toContain("no tiene un precio configurado");
    expect(markup).not.toContain(
      "saldo suficiente para cubrir la seña completa",
    );
  });
});

/**
 * Mapea cada columna de importe de la fila de inscripción a si se muestra como
 * tentativa. Se ancla en el encabezado de la columna, no en su posición, para
 * que el test hable de "Saldo" y no de "la celda 5".
 */
function tentativeAmounts(markup: string) {
  const document = new DOMParser().parseFromString(markup, "text/html");
  const table = document.querySelector('[aria-label="Inscripciones"] table');
  const headers = [...(table?.querySelectorAll("thead th") ?? [])].map(
    (header) => header.textContent?.trim() ?? "",
  );
  const cells = [...(table?.querySelectorAll("tbody tr td") ?? [])];

  return Object.fromEntries(
    ["Precio base", "Seña", "Saldo"].map((column) => {
      const cell = cells[headers.indexOf(column)];

      if (!cell) {
        throw new Error(`No se encontró la columna "${column}".`);
      }

      return [column, cell.classList.contains("text-muted-foreground")];
    }),
  );
}

/**
 * MetricCard de una porción, ubicada por su título. Se ancla en el texto del
 * título y no en la posición para que el test hable de "Seña"/"Saldo"/"Total".
 */
function portionCard(markup: string, title: string): Element {
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
          <AdministracionCoreografiaFinancieraDetalleView
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
    canPayInscriptionBalance: false,
    inscriptionDeposit: null,
    inscriptions: [inscriptionFixture({ state: "señada" })],
    invoicing: invoicingFixture(),
    payments: [],
    stage: null,
    selectedEventId: "event_1",
    ...overrides,
  };
}

function invoicingFixture(
  overrides: Partial<ChoreographyFinanceDetailLoaderData["invoicing"]> = {},
): ChoreographyFinanceDetailLoaderData["invoicing"] {
  return {
    billableAmount: 0,
    porcion: null,
    canEmit: false,
    sena: null,
    saldo: null,
    ...overrides,
  };
}

function choreographyFixture(
  overrides: Partial<ChoreographyRow> = {},
): ChoreographyRow {
  return {
    balanceAmount: { amount: 7000, status: "complete" },
    depositAmount: { amount: 3000, status: "complete" },
    depositCompletedOn: "2026-03-21",
    financialState: "señada",
    groupType: "duo",
    id: "choreography_1",
    name: "Aire",
    needsAttention: false,
    paidAmount: 3000,
    ...overrides,
  };
}

function paymentFixture(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    availableAmount: 3000,
    id: "payment_1",
    paymentDate: "2026-03-21",
    paymentMethod: "transferencia",
    paymentNumber: 1,
    stageTotalAmount: 3000,
    ...overrides,
  };
}

function inscriptionFixture(
  overrides: Partial<InscriptionRow> = {},
): InscriptionRow {
  return {
    basePriceAmount: 10000,
    balanceAmount: 7000,
    dancerId: "dancer_1",
    depositAmount: 3000,
    discountAmount: 0,
    finalPriceAmount: 10000,
    firstName: "Ana",
    inscriptionId: "inscription_1",
    lastName: "López",
    state: "señada",
    undoableAllocation: null,
    ...overrides,
  };
}

describe("AdministracionCoreografiaFinancieraDetalleView actions menu", () => {
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
            <AdministracionCoreografiaFinancieraDetalleView
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
        porcion: "seña",
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
});

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

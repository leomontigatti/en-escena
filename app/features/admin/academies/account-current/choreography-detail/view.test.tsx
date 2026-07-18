/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

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
    expect(markup).toContain("Volver");
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

    expect(markup).not.toContain("No existen pagos con saldo suficiente");
  });

  test("warns when no payment covers the stage total of its own date", () => {
    const markup = renderDetail({
      stage: "deposit",
      payments: [
        paymentFixture({ availableAmount: 2400, stageTotalAmount: 3000 }),
      ],
    });

    expect(markup).toContain("No existen pagos con saldo suficiente");
  });

  test("warns when the stage total is unknown because that date has no price", () => {
    const markup = renderDetail({
      stage: "deposit",
      payments: [paymentFixture({ stageTotalAmount: null })],
    });

    expect(markup).toContain("No existen pagos con saldo suficiente");
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
    expect(markup).not.toContain("No existen pagos con saldo suficiente");
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
    inscriptionDeposit: null,
    inscriptions: [inscriptionFixture({ state: "señada" })],
    payments: [],
    stage: null,
    selectedEventId: "event_1",
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
    ...overrides,
  };
}

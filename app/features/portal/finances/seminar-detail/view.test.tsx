/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import type { loadPortalSeminarFinanceDetail } from "./server";
import { PortalSeminarFinanceDetailRouteView } from "./view";

type LoaderData = Awaited<ReturnType<typeof loadPortalSeminarFinanceDetail>>;
type InscriptionRow = LoaderData["inscriptions"][number];

describe("PortalSeminarFinanceDetailRouteView", () => {
  test("titles the unit by the instructor alone and dates it in the description", () => {
    const markup = renderDetail();

    expect(markup).toContain("Abril Sosa");
    expect(markup).toContain("10 de octubre de 2026");
  });

  test("renders the five metrics with the academy's available balance", () => {
    const markup = renderDetail();

    expect(amountCard(markup, "Seña total").textContent).toContain("$ 5.000");
    expect(amountCard(markup, "Seña adeudada").textContent).toContain("$ 0");
    expect(amountCard(markup, "Total").textContent).toContain("$ 10.000");
    expect(amountCard(markup, "Saldo adeudado").textContent).toContain(
      "$ 5.000",
    );
    // The academy's pool, not the seminar's: the same figure the summary shows.
    expect(amountCard(markup, "Saldo disponible").textContent).toContain(
      "$ 7.000",
    );
  });

  test("lists the person plus the shared money columns, with the price by name", () => {
    const markup = renderDetail();

    expect(columnHeaders(markup)).toEqual([
      "Inscripto",
      "Precio",
      "Seña",
      "Total",
      "Saldo adeudado",
      "Estado",
    ]);
    expect(markup).toContain("Ana López");
    // The effective row's **name**, never its amount.
    expect(markup).toContain("Participante general");
  });

  // The academy reads here and does nothing else: the money dialog and the
  // comprobante are the administrator's, so the name is plain text.
  test("offers no write: the person is not a button and there is no comprobante", () => {
    const markup = renderDetail();

    expect(markup).not.toContain("Emitir factura");
    expect(markup).not.toContain("Asignar dinero");
    // No cell opens anything: the administrator's name cell is the button that
    // opens the money dialog, and here the whole row is a reading.
    expect(
      inscriptionsTable(markup)?.querySelectorAll("tbody button").length,
    ).toBe(0);
    expect(markup).not.toContain("<form");
  });

  test("lists a withdrawn inscription badged as withdrawn, with what it retained", () => {
    const markup = renderDetail({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 5000,
          financialStatus: "depositMet",
          firstName: "Nicolás",
          inscriptionId: "seminar_inscription_2",
          lastName: "Prado",
          withdrawn: true,
        }),
      ],
    });

    expect(markup).toContain("Retirada");
    expect(markup).toContain("$ 5.000");
  });

  test("repeats the full-quota notice without blocking anything", () => {
    const full = renderDetail({
      seminar: { ...loaderDataFixture().seminar, availablePlaces: 0 },
    });

    expect(full).toContain("El seminario no tiene lugares disponibles");
    expect(full).toContain("no se cubre hasta que se libere un lugar");

    expect(renderDetail()).not.toContain(
      "El seminario no tiene lugares disponibles",
    );
  });
});

function columnHeaders(markup: string) {
  return [...(inscriptionsTable(markup)?.querySelectorAll("thead th") ?? [])]
    .map((header) => header.textContent?.trim() ?? "")
    .filter((header) => header !== "");
}

function inscriptionsTable(markup: string) {
  return new DOMParser()
    .parseFromString(markup, "text/html")
    .querySelector("table");
}

function amountCard(markup: string, title: string): Element {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const card = [...parsed.querySelectorAll('[data-slot="card"]')].find(
    (element) =>
      element.querySelector('[data-slot="card-title"]')?.textContent?.trim() ===
      title,
  );

  if (!card) {
    throw new Error(`Expected a MetricCard titled "${title}".`);
  }

  return card;
}

function renderDetail(overrides: Partial<LoaderData> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <PortalSeminarFinanceDetailRouteView
            loaderData={loaderDataFixture(overrides)}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function loaderDataFixture(overrides: Partial<LoaderData> = {}): LoaderData {
  return {
    availableBalanceAmount: 7000,
    inscriptions: [inscriptionFixture()],
    seminar: {
      allocatedAmount: 5000,
      anomalies: [],
      availablePlaces: 4,
      depositAmount: { amount: 5000, status: "complete" },
      financialStatus: "depositMet",
      id: "seminar_1",
      instructorName: "Abril Sosa",
      owedBalanceAmount: { amount: 5000, status: "complete" },
      owedDepositAmount: { amount: 0, status: "complete" },
      registrationCount: 1,
      scheduledDate: "2026-10-10",
      totalAmount: { amount: 10000, status: "complete" },
    },
    ...overrides,
  };
}

function inscriptionFixture(
  overrides: Partial<InscriptionRow> = {},
): InscriptionRow {
  return {
    allocatedAmount: 5000,
    anomalies: [],
    dancerDiscountAmount: 0,
    depositAmount: 5000,
    effectivePrice: {
      amount: 10000,
      depositAmount: 5000,
      id: "seminar_price_1",
      name: "Participante general",
    },
    financialStatus: "depositMet",
    firstName: "Ana",
    inscriptionId: "seminar_inscription_1",
    lastName: "López",
    overAllocatedAmount: 0,
    owedBalanceAmount: 5000,
    owedDepositAmount: 0,
    totalAmount: 10000,
    withdrawn: false,
    ...overrides,
  };
}

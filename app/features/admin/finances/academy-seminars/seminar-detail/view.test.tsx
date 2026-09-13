/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import type { loadSeminarFinanceDetail } from "./server";
import { SeminarFinanceDetailView } from "./view";

// The loader returns a union: with no active event there is no seminar. The
// fixtures always model the branch with an event.
type SeminarFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadSeminarFinanceDetail>>,
  { selectedEventId: string }
>;
type InscriptionRow = SeminarFinanceDetailLoaderData["inscriptions"][number];

describe("SeminarFinanceDetailView", () => {
  test("titles the unit by the instructor alone and dates it in the description", () => {
    const markup = renderDetail();

    expect(markup).toContain("Abril Sosa");
    // The date is what tells two seminars of the same instructor apart, and it
    // is a subtitle rather than part of the name.
    expect(markup).toContain("10 de octubre de 2026");
    expect(markup).toContain(
      "Revisá y/o modificá las asignaciones de cada inscripción",
    );
  });

  test("renders the five metrics with the academy's available balance", () => {
    const markup = renderDetail();

    expect(amountCard(markup, "Seña total").textContent).toContain("$ 5.000");
    expect(amountCard(markup, "Seña adeudada").textContent).toContain("$ 0");
    expect(amountCard(markup, "Total").textContent).toContain("$ 10.000");
    expect(amountCard(markup, "Saldo adeudado").textContent).toContain(
      "$ 5.000",
    );
    // The academy's, not the seminar's: it is the unallocated pool.
    expect(amountCard(markup, "Saldo disponible").textContent).toContain(
      "$ 7.000",
    );
  });

  test("lists the person plus the shared money columns, with no `Tipo` column", () => {
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
    // The effective row's **name**, never its amount: the amount is already in
    // `Total`.
    expect(markup).toContain("Participante general");
    expect(markup).not.toContain("Tipo de grupo");
  });

  test("lists a withdrawn inscription marked as withdrawn, with what it retained", () => {
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

  test("states a full quota without blocking anything, and says nothing while a place is left", () => {
    const full = renderDetail({
      seminar: { ...loaderDataFixture().seminar, availablePlaces: 0 },
    });

    expect(full).toContain("El seminario no tiene lugares disponibles");
    expect(full).toContain("se rechaza hasta que se libere un lugar");

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

/**
 * Renders with a data router because the money dialog uses `useFetcher`, which
 * does not work with a plain memory router.
 */
function renderDetail(overrides: Partial<SeminarFinanceDetailLoaderData> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <SeminarFinanceDetailView loaderData={loaderDataFixture(overrides)} />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function loaderDataFixture(
  overrides: Partial<SeminarFinanceDetailLoaderData> = {},
): SeminarFinanceDetailLoaderData {
  return {
    academy: {
      contactName: "Academia Centro",
      id: "academy_1",
      name: "Academia Centro",
      phone: "11-5555-5555",
    },
    availableBalanceAmount: 7000,
    inscriptions: [inscriptionFixture()],
    priceOptionsByInscription: {
      seminar_inscription_1: [
        {
          amount: 10000,
          depositAmount: 5000,
          id: "seminar_price_1",
          name: "Participante general",
        },
      ],
    },
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
    selectedEventId: "event_1",
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

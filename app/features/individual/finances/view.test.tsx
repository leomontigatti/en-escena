/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { loadIndividualFinances } from "./server";
import { IndividualFinancesView } from "./view";

type LoaderData = Awaited<ReturnType<typeof loadIndividualFinances>>;
type ActiveEventLoaderData = Exclude<LoaderData, { activeEvent: null }>;

describe("IndividualFinancesView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("reads its comprobantes on their own tab", async () => {
    await render(loaderDataFixture(), "?lista=comprobantes");

    const text = document.body.textContent ?? "";

    expect(text).toContain("0001-00000012");
    expect(text).toContain("Seminario Abril Sosa, 10/10/2030");
    expect(text).toContain("Vigente");
  });

  test("reads its payments on their own tab", async () => {
    await render(loaderDataFixture(), "?lista=pagos");

    expect(document.body.textContent).toContain("$ 15.000");
  });

  test("shows the event's payment instructions only when the event has them", async () => {
    await render({
      ...loaderDataFixture(),
      paymentInstructions: {
        alias: "mi.alias-01",
        bankName: null,
        cbu: null,
        holderCuit: null,
        holderName: null,
        text: null,
      },
    });

    expect(
      document.querySelector('[data-slot="alert"]')?.textContent,
    ).toContain("mi.alias-01");

    renderer.cleanup();
    await render(loaderDataFixture());

    expect(document.querySelector('[data-slot="alert"]')).toBeNull();
  });

  async function render(loaderData: LoaderData, search = "") {
    await renderer.renderAsync(
      renderInDataRouter(
        `/particular/finanzas${search}`,
        <IndividualFinancesView loaderData={loaderData} />,
      ),
    );
  }
});

function loaderDataFixture(): ActiveEventLoaderData {
  const amount = (value: number) => ({
    amount: value,
    status: "complete" as const,
  });

  return {
    activeEvent: {
      id: "event_1",
      name: "Regional 2026",
    } as NonNullable<LoaderData["activeEvent"]>,
    comprobantes: [
      {
        id: "comprobante_1",
        anchor: {
          kind: "seminar",
          instructorName: "Abril Sosa",
          scheduledDate: "2030-10-10",
          seminarId: "seminar_1",
        },
        cbteFch: "20260722",
        cbteNro: 12,
        cbteTipo: 11,
        impTotal: 15000,
        ptoVta: 1,
        status: "valid",
      },
    ],
    paymentInstructions: null,
    payments: [
      {
        id: "payment_1",
        amount: 15000,
        paymentDate: "2026-04-01",
        paymentMethod: "transferencia",
        paymentNumber: 1,
        reference: null,
      },
    ],
    seminarFinanceRows: [
      {
        id: "seminar_1",
        instructorName: "Abril Sosa",
        scheduledDate: "2030-10-10",
        financialStatus: "depositMet",
        anomalies: [],
        depositAmount: amount(15000),
        totalAmount: amount(30000),
        owedBalanceAmount: amount(15000),
      } as unknown as LoaderData["seminarFinanceRows"][number],
    ],
    summary: {
      ...emptyOperationalFinanceSummary(),
      availableBalanceAmount: 5000,
    },
  };
}

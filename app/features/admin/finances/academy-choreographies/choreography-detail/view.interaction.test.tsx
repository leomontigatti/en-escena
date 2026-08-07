/** @vitest-environment jsdom */

import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { ChoreographyFinanceDetailView } from "./view";
import type { loadChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadChoreographyFinanceDetail>>,
  { selectedEventId: string }
>;

describe("DancerNameCell interaction", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("clicking a señada name opens the balance dialog", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <ChoreographyFinanceDetailView loaderData={loaderDataFixture()} />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(document.body.textContent).not.toContain("Asignar saldo");

    await clickReactDomButton("Bruno Benítez");

    expect(document.body.textContent).toContain("Asignar saldo");
  });

  // Regresión: el diálogo por fila vivía en una celda que se remontaba cuando
  // el padre re-renderizaba (por columnas recreadas en cada render), lo que lo
  // cerraba de inmediato. Con las columnas memoizadas y loaderData estable el
  // diálogo debe sobrevivir a un re-render del padre.
  test("keeps the dialog open across a parent re-render", async () => {
    const loaderData = loaderDataFixture();

    function Wrapper() {
      const [, setTick] = useState(0);
      return (
        <>
          <button
            type="button"
            aria-label="re-render"
            onClick={() => setTick((tick) => tick + 1)}
          >
            re-render
          </button>
          <ChoreographyFinanceDetailView loaderData={loaderData} />
        </>
      );
    }

    const router = createMemoryRouter([{ path: "/", element: <Wrapper /> }], {
      initialEntries: ["/"],
    });

    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickReactDomButton("Bruno Benítez");
    expect(document.body.textContent).toContain("Asignar saldo");

    await clickReactDomButton("re-render");
    expect(document.body.textContent).toContain("Asignar saldo");
  });
});

function loaderDataFixture(): ChoreographyFinanceDetailLoaderData {
  return {
    academy: {
      contactName: "Academia Centro",
      id: "academy_1",
      name: "Academia Centro",
      phone: "11-5555-5555",
    },
    choreography: {
      allocatedAmount: 3000,
      anomalies: [],
      depositAmount: { amount: 3000, status: "complete" },
      depositCompletedOn: "2026-03-21",
      financialStatus: "depositMet",
      groupType: "duo",
      id: "choreography_1",
      name: "Aire",
      overAllocatedAmount: 0,
      owedBalanceAmount: { amount: 7000, status: "complete" },
      owedDepositAmount: { amount: 0, status: "complete" },
      totalAmount: { amount: 10000, status: "complete" },
    },
    canPayInscriptionBalance: true,
    inscriptionDeposit: null,
    inscriptions: [
      {
        allocatedAmount: 3000,
        anomalies: [],
        basePriceAmount: 10000,
        dancerId: "dancer_1",
        depositAmount: 3000,
        discountAmount: 0,
        financialStatus: "depositMet",
        firstName: "Bruno",
        inscriptionId: "inscription_orphan",
        ladderStage: "señada",
        lastName: "Benítez",
        overAllocatedAmount: 0,
        owedBalanceAmount: 7000,
        owedDepositAmount: 0,
        totalAmount: 10000,
        undoableAllocation: null,
      },
    ],
    invoicing: {
      billableAmount: 0,
      porcion: null,
      canEmit: false,
      sena: null,
      saldo: null,
    },
    payments: [],
    stage: null,
    selectedEventId: "event_1",
  };
}

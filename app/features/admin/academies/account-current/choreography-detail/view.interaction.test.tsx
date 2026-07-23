/** @vitest-environment jsdom */

import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { AdministracionCoreografiaFinancieraDetalleView } from "./view";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>>,
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
            <AdministracionCoreografiaFinancieraDetalleView
              loaderData={loaderDataFixture()}
            />
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
          <AdministracionCoreografiaFinancieraDetalleView
            loaderData={loaderData}
          />
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
      balanceAmount: { amount: 7000, status: "complete" },
      depositAmount: { amount: 3000, status: "complete" },
      depositCompletedOn: "2026-03-21",
      financialState: "señada",
      groupType: "duo",
      id: "choreography_1",
      name: "Aire",
      needsAttention: false,
      paidAmount: 3000,
    },
    canPayInscriptionBalance: true,
    inscriptionDeposit: null,
    inscriptions: [
      {
        basePriceAmount: 10000,
        balanceAmount: 7000,
        dancerId: "dancer_1",
        depositAmount: 3000,
        discountAmount: 0,
        finalPriceAmount: 10000,
        firstName: "Bruno",
        inscriptionId: "inscription_orphan",
        lastName: "Benítez",
        state: "señada",
        undoableAllocation: null,
      },
    ],
    invoicing: {
      billableAmount: 0,
      porcion: null,
      canEmit: false,
      currency: null,
      lastComprobante: null,
    },
    payments: [],
    stage: null,
    selectedEventId: "event_1",
  };
}

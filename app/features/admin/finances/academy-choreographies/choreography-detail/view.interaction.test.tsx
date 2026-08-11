/** @vitest-environment jsdom */

import { useState } from "react";
import {
  createMemoryRouter,
  redirect,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { ChoreographyFinanceDetailView } from "./view";
import type { loadChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadChoreographyFinanceDetail>>,
  { selectedEventId: string }
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];

describe("DancerNameCell interaction", () => {
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

  test("clicking a name opens the allocation dialog for that inscription", async () => {
    await mount();

    expect(document.body.textContent).not.toContain("Asignar plata");

    await clickReactDomButton("Bruno Benítez");

    expect(document.body.textContent).toContain("Asignar plata");
    expect(document.body.textContent).toContain("Bruno Benítez");
  });

  test("hints the owed figure as a placeholder and never as a value", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");

    const amount = amountInput();
    // The seña is already covered, so what is left to finish is the saldo.
    expect(amount.placeholder).toBe("$ 7.000");
    expect(amount.value).toBe("");
  });

  test("hints the seña first while the deposit threshold is unmet", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 0,
          financialStatus: "depositPending",
          owedBalanceAmount: 10000,
          owedDepositAmount: 3000,
        }),
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    expect(amountInput().placeholder).toBe("$ 3.000");
  });

  test("locks the price of an inscription that already holds money", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");

    // Locked, not warned about: the price is a reading and there is no picker.
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(document.body.textContent).toContain(
      "Para cambiarle el precio hay que quitarle toda la plata",
    );
  });

  test("offers the price picker while no money has landed", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 0,
          financialStatus: "depositPending",
          owedBalanceAmount: 10000,
          owedDepositAmount: 3000,
          selectedPrice: null,
        }),
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    expect(
      document.querySelector('[data-slot="select-trigger"]'),
    ).not.toBeNull();
  });

  test("opens the removal dialog with no price control on a fully paid row", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 10000,
          financialStatus: "paidInFull",
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).toContain("Quitar plata");
    expect(dialogText()).not.toContain("Precio");
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    // Prefilled with everything allocated, and it accepts any smaller amount.
    expect(amountInput("inscription-removed-amount").value).toBe("10000");
  });

  test("reaches the removal dialog from a row that still owes something", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");
    await clickReactDomButton("Quitar plata");

    expect(dialogText()).not.toContain("Precio");
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(amountInput("inscription-removed-amount").value).toBe("3000");
  });

  test("offers one click that releases exactly the excess", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 12000,
          anomalies: ["overAllocated"],
          financialStatus: "paidInFull",
          overAllocatedAmount: 2000,
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).toContain("Liberar $ 2.000");
    expect(dialogText()).not.toContain("Precio");
    // Neither amount nor price: the figure is computed.
    expect(document.querySelector("input#inscription-amount")).toBeNull();
    expect(
      document.querySelector("input#inscription-removed-amount"),
    ).toBeNull();
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
  });

  test("leaves a dancer without an inscription as plain text", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 0,
          basePriceAmount: null,
          depositAmount: null,
          financialStatus: "depositPending",
          inscriptionId: null,
          overAllocatedAmount: null,
          owedBalanceAmount: null,
          owedDepositAmount: null,
          selectedPrice: null,
          totalAmount: null,
        }),
      ],
    });

    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Bruno Benítez"),
    );
    expect(button).toBeUndefined();
    expect(document.body.textContent).toContain("Bruno Benítez");
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
    expect(document.body.textContent).toContain("Asignar plata");

    await clickReactDomButton("re-render");
    expect(document.body.textContent).toContain("Asignar plata");
  });

  // Regression (#708): a refused write left its reason on screen for an instant
  // and then took the dialog with it. The dialog lived in a table cell, so the
  // revalidation that follows the write rebuilt the columns off the fresh
  // `loaderData` and remounted the row.
  test("keeps the dialog open, with the reason, when the write is refused", async () => {
    await mountAgainst(() => ({
      status: "error",
      message: "El saldo disponible de la academia no alcanza.",
    }));

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("5000");
    await clickReactDomButton("Guardar");

    expect(dialogText()).toContain(
      "El saldo disponible de la academia no alcanza.",
    );
    expect(dialogText()).toContain("Asignar plata");
  });

  test("closes the dialog when the write goes through", async () => {
    await mountAgainst(() => redirect("/"));

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("5000");
    await clickReactDomButton("Guardar");

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  // The same remount, reached without a write: every revalidation hands the
  // view a `loaderData` of its own, and the dialog has to outlive that.
  test("keeps the dialog open across a fresh loaderData", async () => {
    function Wrapper() {
      const [, setRevalidations] = useState(0);

      return (
        <>
          <button
            type="button"
            aria-label="revalidar"
            onClick={() => setRevalidations((count) => count + 1)}
          >
            revalidar
          </button>
          {/* Built inline, so each render passes a `loaderData` of its own. */}
          <ChoreographyFinanceDetailView loaderData={loaderDataFixture()} />
        </>
      );
    }

    const router = createMemoryRouter([{ path: "/", element: <Wrapper /> }], {
      initialEntries: ["/"],
    });

    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickReactDomButton("Bruno Benítez");
    expect(document.body.textContent).toContain("Asignar plata");

    await clickReactDomButton("revalidar");
    expect(document.body.textContent).toContain("Asignar plata");
  });

  /** Mounts the view behind a real loader, so a write revalidates it. */
  async function mountAgainst(action: () => unknown) {
    function ChoreographyFinanceDetailRoute() {
      const loaderData = useLoaderData() as ChoreographyFinanceDetailLoaderData;

      return <ChoreographyFinanceDetailView loaderData={loaderData} />;
    }

    const router = createMemoryRouter(
      [
        {
          path: "/",
          action,
          // A fresh object on every call, the way a revalidation hands it over.
          loader: () => loaderDataFixture(),
          Component: ChoreographyFinanceDetailRoute,
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  async function typeAmount(value: string) {
    await updateReactDomForm(() => {
      setInputValue(amountInput(), value);
    });
  }
});

function amountInput(id = "inscription-amount"): HTMLInputElement {
  const input = document.querySelector(`input#${id}`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected the "${id}" field to be rendered.`);
  }

  return input;
}

/** Texto del diálogo abierto, para no confundirlo con el de la tabla de atrás. */
function dialogText(): string {
  const dialog = document.querySelector('[data-slot="dialog-content"]');

  if (!dialog) {
    throw new Error("Expected a money dialog to be open.");
  }

  return dialog.textContent ?? "";
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
    financialStatus: "depositMet",
    firstName: "Bruno",
    inscriptionId: "inscription_orphan",
    lastName: "Benítez",
    overAllocatedAmount: 0,
    owedBalanceAmount: 7000,
    owedDepositAmount: 0,
    selectedPrice: { amount: 10000, id: "price_1", name: "Dúo general" },
    totalAmount: 10000,
    withdrawn: false,
    ...overrides,
  };
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
    choreography: {
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
    },
    inscriptions: [inscriptionFixture()],
    invoicing: {
      billableAmount: 0,
      porcion: null,
      canEmit: false,
      sena: null,
      saldo: null,
    },
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

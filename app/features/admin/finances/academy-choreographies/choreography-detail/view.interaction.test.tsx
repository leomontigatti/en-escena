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

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();

    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).toContain(allocateDescription);
    // El título es el nombre de la bailarina: es el que dice de quién se habla.
    expect(dialogText()).toContain("Bruno Benítez");
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

  // Se traba al cubrir la seña —3000 de 3000—, que es donde la traba la regla.
  test("locks the price of an inscription that covers its seña", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");

    // Trabado y sin aviso: el precio es una lectura y no hay selector.
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(dialogText()).not.toContain("Para cambiarle el precio");
    // Y dice lo mismo que decía el selector que reemplaza, seña incluida.
    const readout = [...document.querySelectorAll("input")].find((candidate) =>
      candidate.value.includes("Dúo general"),
    );

    expect(readout?.value).toBe("Dúo general · $ 10.000 · seña $ 3.000");
  });

  // Debajo de la seña el precio se sigue re-derivando solo, así que el selector
  // sigue estando: el primer peso no traba nada.
  test("keeps the picker on a row that holds money but has not covered its seña", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 200,
          financialStatus: "depositPending",
          owedBalanceAmount: 9800,
          owedDepositAmount: 2800,
        }),
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    expect(
      document.querySelector('[data-slot="select-trigger"]'),
    ).not.toBeNull();
  });

  // Las dos deudas repiten el precio de arriba mientras no haya plata puesta.
  test("shows the owed figures only once the inscription holds money", async () => {
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

    expect(dialogText()).not.toContain("Seña adeudada");

    await clickReactDomButton("Cancelar");
    await mount();
    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).toContain("Seña adeudada");
  });

  // El techo es lo que se adeuda, y se dice bajo el campo en vez de volver del
  // servidor como alerta.
  test("says the range under the field when the allocated amount exceeds what is owed", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");
    await updateReactDomForm(() => {
      setInputValue(amountInput(), "99999");
    });

    expect(
      document.querySelector('[data-slot="field-error"]')?.textContent,
    ).toBe("Ingresá un monto entre $ 1 y $ 7.000.");
    expect(guardarButton()?.disabled).toBe(true);
  });

  test("offers the price picker while no money has landed", async () => {
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

    expect(
      document.querySelector('[data-slot="select-trigger"]'),
    ).not.toBeNull();
  });

  // El selector abre en el precio **efectivo**, no en el guardado. Abrirlo en el
  // guardado dejaba el diálogo diciendo dos precios a la vez —el selector, uno;
  // el placeholder del monto y las dos deudas, otro— y confirmar sin tocarlo
  // fijaba el viejo en cuanto la imputación cubría la seña.
  test("opens the price picker on the effective price", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 0,
          effectivePrice: {
            amount: 14000,
            depositAmount: 4200,
            id: "price_3",
            name: "Tercer vencimiento",
          },
          financialStatus: "depositPending",
          owedBalanceAmount: 14000,
          owedDepositAmount: 4200,
        }),
      ],
      priceOptions: [
        {
          amount: 10000,
          depositAmount: 3000,
          id: "price_1",
          name: "Primer vencimiento",
        },
        {
          amount: 14000,
          depositAmount: 4200,
          id: "price_3",
          name: "Tercer vencimiento",
        },
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    const trigger = document.querySelector('[data-slot="select-trigger"]');

    expect(trigger?.textContent).toContain("Tercer vencimiento");
    expect(trigger?.textContent).not.toContain("Primer vencimiento");
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

    expect(dialogText()).toContain(removeDescription);
    expect(dialogText()).not.toContain("Precio");
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    // Todo lo asignado se sugiere como placeholder, igual que al imputar, y
    // acepta cualquier monto menor.
    const removed = amountInput("inscription-removed-amount");

    expect(removed.value).toBe("");
    expect(removed.placeholder).toBe("$ 10.000");
    // El total asignado lo dice el placeholder, así que la línea `Asignado` que
    // lo repetía debajo del campo se fue.
    expect(dialogText()).not.toContain("Asignado");
  });

  // El rango se dice bajo el campo y no como alerta: es sobre lo que se tipeó, y
  // el borde se conoce acá sin ir al servidor.
  test("says the range under the field when the amount is out of it", async () => {
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
    await typeRemovedAmount("250000");

    const error = document.querySelector('[data-slot="field-error"]');

    expect(error?.textContent).toBe("Ingresá un monto entre $ 1 y $ 10.000.");
    expect(
      amountInput("inscription-removed-amount").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(quitarButton()?.disabled).toBe(true);
  });

  test("clears the range error and re-enables Quitar once the amount fits", async () => {
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
    await typeRemovedAmount("250000");
    await typeRemovedAmount("2500");

    expect(document.querySelector('[data-slot="field-error"]')).toBeNull();
    expect(quitarButton()?.disabled).toBe(false);
  });

  test("reaches the removal dialog from a row that still owes something", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");
    await clickReactDomButton("Quitar dinero");

    expect(dialogText()).not.toContain("Precio");
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(amountInput("inscription-removed-amount").value).toBe("");
    expect(amountInput("inscription-removed-amount").placeholder).toBe(
      "$ 3.000",
    );
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
          effectivePrice: null,
          financialStatus: "depositPending",
          inscriptionId: null,
          overAllocatedAmount: null,
          owedBalanceAmount: null,
          owedDepositAmount: null,
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
    expect(dialogText()).toContain(allocateDescription);

    await clickReactDomButton("re-render");
    expect(dialogText()).toContain(allocateDescription);
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
    expect(dialogText()).toContain(allocateDescription);
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
    expect(dialogText()).toContain(allocateDescription);

    await clickReactDomButton("revalidar");
    expect(dialogText()).toContain(allocateDescription);
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

describe("inscriptions table filters", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  const roster = [
    inscriptionFixture({
      dancerId: "dancer_1",
      firstName: "Bruno",
      inscriptionId: "inscription_1",
      lastName: "Benítez",
    }),
    inscriptionFixture({
      dancerId: "dancer_2",
      financialStatus: "paidInFull",
      firstName: "Ana",
      inscriptionId: "inscription_2",
      lastName: "López",
      owedBalanceAmount: 0,
    }),
    inscriptionFixture({
      dancerId: "dancer_3",
      financialStatus: "paidInFull",
      firstName: "Carla",
      inscriptionId: "inscription_3",
      lastName: "Díaz",
      owedBalanceAmount: 0,
      withdrawn: true,
    }),
  ];

  async function mount() {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <ChoreographyFinanceDetailView
              loaderData={loaderDataFixture({ inscriptions: roster })}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("searches the inscriptions by the dancer's name", async () => {
    await mount();

    expect(renderedDancerNames()).toEqual([
      "Bruno Benítez",
      "Ana López",
      "Carla Díaz",
    ]);

    await updateReactDomForm(() => {
      setInputValue(searchInput(), "lóp");
    });

    expect(renderedDancerNames()).toEqual(["Ana López"]);
  });

  test("filters by the badge the Estado column shows, Retirada included", async () => {
    await mount();

    // `Retirada` reemplaza al estado de dinero, así que filtrar por `Pagada` no
    // trae a la retirada aunque su plata esté completa.
    await selectStatusOption("Pagada");
    expect(renderedDancerNames()).toEqual(["Ana López"]);

    await selectStatusOption("Pagada");
    await selectStatusOption("Retirada");
    expect(renderedDancerNames()).toEqual(["Carla Díaz"]);
  });
});

function searchInput(): HTMLInputElement {
  const input = document.querySelector(
    'input[placeholder="Buscar inscripción por bailarín"]',
  );

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected the inscriptions search field to be rendered.");
  }

  return input;
}

/** Los nombres visibles de la tabla, en orden. */
function renderedDancerNames() {
  return [
    ...document.querySelectorAll('[aria-label="Inscripciones"] tbody tr'),
  ].map((row) => row.querySelector("td")?.textContent?.trim() ?? "");
}

/** Abre el menú de filtros y togglea una opción de `Estado` por su etiqueta. */
async function selectStatusOption(label: string) {
  const trigger = document.querySelector('button[aria-label^="Filtros"]');

  if (!trigger) {
    throw new Error("Expected the filters trigger to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

  await updateReactDomForm(() => {
    trigger.dispatchEvent(pointerDown);
    trigger.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    );
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });

  const option = [...document.querySelectorAll('[role="menuitemradio"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!option) {
    throw new Error(`Expected the "${label}" status option to be offered.`);
  }

  await updateReactDomForm(() => {
    option.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function amountInput(id = "inscription-amount"): HTMLInputElement {
  const input = document.querySelector(`input#${id}`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected the "${id}" field to be rendered.`);
  }

  return input;
}

async function typeRemovedAmount(value: string) {
  await updateReactDomForm(() => {
    setInputValue(amountInput("inscription-removed-amount"), value);
  });
}

/** El botón que confirma la imputación, para leerle el estado deshabilitado. */
function guardarButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Guardar",
    ) ?? null
  );
}

/** El botón que confirma la quita, para leerle el estado deshabilitado. */
function quitarButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Quitar",
    ) ?? null
  );
}

/**
 * Las descripciones que distinguen una forma del diálogo de otra: el título es el
 * nombre de la bailarina en las tres, así que la cabecera ya no dice cuál es.
 */
const allocateDescription =
  "El dinero se asigna desde el saldo disponible de la academia.";
const removeDescription =
  "El dinero que se quita vuelve al saldo disponible de la academia.";

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
    effectivePrice: {
      amount: 10000,
      depositAmount: 3000,
      id: "price_1",
      name: "Dúo general",
    },
    financialStatus: "depositMet",
    firstName: "Bruno",
    inscriptionId: "inscription_orphan",
    lastName: "Benítez",
    overAllocatedAmount: 0,
    owedBalanceAmount: 7000,
    owedDepositAmount: 0,
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
    availableBalanceAmount: 5000,
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
      canEmit: false,
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

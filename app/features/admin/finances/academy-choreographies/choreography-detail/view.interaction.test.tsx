/** @vitest-environment jsdom */

import { useState } from "react";
import {
  createMemoryRouter,
  redirect,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import { applyTableFilter } from "@/lib/test-support/data-table-filters";

import { ChoreographyFinanceDetailView } from "./view";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastError(message),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));
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
    // The title is the dancer's name: it is what says who is being talked about.
    expect(dialogText()).toContain("Bruno Benítez");
  });

  test("hints the owed figure as a placeholder and never as a value", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");

    const amount = amountInput();
    // The deposit is already covered, so what is left to finish is the balance.
    expect(amount.placeholder).toBe("$ 7.000");
    expect(amount.value).toBe("");
  });

  test("hints the deposit first while that threshold is unmet", async () => {
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

  // It locks on covering the deposit —3000 of 3000—, which is where the rule
  // locks it.
  test("locks the price of an inscription that covers its deposit", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");

    // Locked and unannounced: the price is a readout and there is no picker.
    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(dialogText()).not.toContain("Para cambiarle el precio");
    // And it says what the picker it replaces said, deposit included.
    const readout = [...document.querySelectorAll("input")].find((candidate) =>
      candidate.value.includes("Dúo general"),
    );

    expect(readout?.value).toBe("Dúo general · $ 10.000 · seña $ 3.000");
  });

  // Everything the dialog says about money follows the **picked** price, not the
  // one the row arrived with: the picker is what the confirm is going to apply,
  // so hinting the old deposit would ask for a figure that is not about to be
  // charged.
  test("re-hints the amount with the deposit of the price that gets picked", async () => {
    await mount({
      inscriptions: [
        inscriptionFixture({
          allocatedAmount: 0,
          financialStatus: "depositPending",
          owedBalanceAmount: 10000,
          owedDepositAmount: 3000,
        }),
      ],
      priceOptions: [
        {
          amount: 10000,
          depositAmount: 3000,
          id: "price_1",
          name: "Dúo general",
        },
        {
          amount: 42000,
          depositAmount: 12600,
          id: "price_2",
          name: "Primer vencimiento",
        },
      ],
    });

    await clickReactDomButton("Bruno Benítez");

    expect(amountInput().placeholder).toBe("$ 3.000");

    await openPriceSelect();
    await selectRadixOption("Primer vencimiento · $ 42.000 · seña $ 12.600");

    expect(amountInput().placeholder).toBe("$ 12.600");
    // And the two owed figures move with it, so the card cannot contradict the
    // hint sitting right above it.
    expect(dialogText()).toContain("$ 42.000");
  });

  // Below the deposit the price keeps re-deriving on its own, so the picker is
  // still there: the first peso locks nothing.
  test("keeps the picker on a row that holds money but has not covered its deposit", async () => {
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

  // The two owed figures restate the price above them while there is no money
  // on the row.
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

  // The ceiling is what is owed, and it is said under the field instead of
  // coming back from the server as an alert.
  // Validated on submit, as every form is: nothing is said while it is typed.
  test("says the range under the field when the allocated amount exceeds what is owed", async () => {
    await mount();

    await clickReactDomButton("Bruno Benítez");
    await updateReactDomForm(() => {
      setInputValue(amountInput(), "99999");
    });

    expect(document.querySelector('[data-slot="field-error"]')).toBeNull();
    expect(guardarButton()?.disabled).toBe(false);

    await clickReactDomButton("Guardar");

    expect(
      document.querySelector('[data-slot="field-error"]')?.textContent,
    ).toBe("Ingresá un monto entre $ 1 y $ 7.000.");
    expect(dialogText()).toContain(allocateDescription);
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

  // The picker opens on the **effective** price, not on the stored one. Opening
  // it on the stored one left the dialog saying two prices at once —the picker,
  // one; the amount's placeholder and the two owed figures, another— and
  // confirming without touching it fixed the old one as soon as the allocation
  // covered the deposit.
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
    // Everything allocated is hinted as a placeholder, just like when
    // allocating, and any smaller amount is accepted.
    const removed = amountInput("inscription-removed-amount");

    expect(removed.value).toBe("");
    expect(removed.placeholder).toBe("$ 10.000");
    // The placeholder says the allocated total, so the `Asignado` line that
    // repeated it under the field is gone.
    expect(dialogText()).not.toContain("Asignado");
  });

  // The range is said under the field and not as an alert: it is about what was
  // typed, and the bound is known here without going to the server.
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

    expect(document.querySelector('[data-slot="field-error"]')).toBeNull();
    expect(quitarButton()?.disabled).toBe(false);

    await clickReactDomButton("Quitar", { exact: true });

    const error = document.querySelector('[data-slot="field-error"]');

    expect(error?.textContent).toBe("Ingresá un monto entre $ 1 y $ 10.000.");
    expect(
      amountInput("inscription-removed-amount").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(dialogText()).toContain(removeDescription);
  });

  test("clears the range error once the amount fits", async () => {
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
    await clickReactDomButton("Quitar", { exact: true });
    await typeRemovedAmount("2500");

    expect(document.querySelector('[data-slot="field-error"]')).toBeNull();
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

  // Regression: the per-row dialog lived in a cell that remounted whenever the
  // parent re-rendered (because the columns were recreated on every render),
  // which closed it immediately. With the columns memoized and loaderData stable,
  // the dialog must survive a parent re-render.
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
  // `loaderData` and remounted the row. The reason is the server's, so it is a
  // toast, and the dialog stays open under it with what was typed.
  test("keeps the dialog open, and toasts the reason, when the write is refused", async () => {
    await mountAgainst(() => ({
      status: "error",
      message: "El saldo disponible de la academia no alcanza.",
    }));

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("5000");
    await clickReactDomButton("Guardar");
    await updateReactDomForm(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(toastError).toHaveBeenCalledWith(
      "El saldo disponible de la academia no alcanza.",
    );
    expect(dialogText()).not.toContain(
      "El saldo disponible de la academia no alcanza.",
    );
    expect(dialogText()).toContain(allocateDescription);
    expect(amountInput().value).toBe("5000");
  });

  // What each gesture posts is the writer's whole input. A locked price posts
  // no `priceId` at all, which is how the writer knows to keep the stored row.
  test("posts the amount, without a price, on a locked allocation", async () => {
    const posted: FormData[] = [];
    await mountAgainst(async ({ request }) => {
      posted.push(await request.formData());

      return redirect("/");
    });

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("5000");
    await clickReactDomButton("Guardar");

    expect(posted.map((formData) => [...formData.entries()].sort())).toEqual([
      [
        ["amount", "5000"],
        ["inscriptionId", "inscription_orphan"],
        ["intent", "allocate-inscription"],
        ["targetKind", "choreography"],
      ],
    ]);
  });

  test("posts the picked price with the amount while the price is open", async () => {
    const posted: FormData[] = [];
    await mountAgainst(
      async ({ request }) => {
        posted.push(await request.formData());

        return redirect("/");
      },
      {
        inscriptions: [
          inscriptionFixture({
            allocatedAmount: 0,
            financialStatus: "depositPending",
            owedBalanceAmount: 10000,
            owedDepositAmount: 3000,
          }),
        ],
      },
    );

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("3000");
    await clickReactDomButton("Guardar");

    expect(posted.map((formData) => [...formData.entries()].sort())).toEqual([
      [
        ["amount", "3000"],
        ["inscriptionId", "inscription_orphan"],
        ["intent", "allocate-inscription"],
        ["priceId", "price_1"],
        ["targetKind", "choreography"],
      ],
    ]);
  });

  test("posts the release with nothing typed, and closes once it goes through", async () => {
    const posted: FormData[] = [];
    await mountAgainst(
      async ({ request }) => {
        posted.push(await request.formData());

        return redirect("/");
      },
      {
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
      },
    );

    await clickReactDomButton("Bruno Benítez");
    await clickReactDomButton("Liberar $ 2.000");

    expect(posted.map((formData) => [...formData.entries()].sort())).toEqual([
      [
        ["inscriptionId", "inscription_orphan"],
        ["intent", "release-inscription-excess"],
        ["targetKind", "choreography"],
      ],
    ]);
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  // Validation is asynchronous, so a second submit can land before the first
  // has posted: money is written once however many times it is confirmed.
  test("posts an allocation once when it is confirmed twice", async () => {
    const posted: FormData[] = [];
    await mountAgainst(async ({ request }) => {
      posted.push(await request.formData());

      return redirect("/");
    });

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("5000");
    await updateReactDomForm(async () => {
      const form = amountInput().form;

      form?.requestSubmit();
      form?.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(posted).toHaveLength(1);
  });

  test("posts nothing when the amount is out of range", async () => {
    const posted: FormData[] = [];
    await mountAgainst(async ({ request }) => {
      posted.push(await request.formData());

      return redirect("/");
    });

    await clickReactDomButton("Bruno Benítez");
    await typeAmount("99999");
    await clickReactDomButton("Guardar");

    expect(posted).toHaveLength(0);
    expect(dialogText()).toContain("Ingresá un monto entre $ 1 y $ 7.000.");
  });

  test("posts the amount to take off on a removal", async () => {
    const posted: FormData[] = [];
    await mountAgainst(async ({ request }) => {
      posted.push(await request.formData());

      return redirect("/");
    });

    await clickReactDomButton("Bruno Benítez");
    await clickReactDomButton("Quitar dinero");
    await typeRemovedAmount("2500");
    await clickReactDomButton("Quitar", { exact: true });

    expect(posted.map((formData) => [...formData.entries()].sort())).toEqual([
      [
        ["amount", "2500"],
        ["inscriptionId", "inscription_orphan"],
        ["intent", "remove-inscription-money"],
        ["targetKind", "choreography"],
      ],
    ]);
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
  async function mountAgainst(
    action: (args: { request: Request }) => unknown,
    overrides: Partial<ChoreographyFinanceDetailLoaderData> = {},
  ) {
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
          loader: () => loaderDataFixture(overrides),
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

describe("waiving an inscription from its money dialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  const emptyRow = inscriptionFixture({
    allocatedAmount: 0,
    financialStatus: "depositPending",
    owedBalanceAmount: 10000,
    owedDepositAmount: 3000,
  });
  const waivedRow = inscriptionFixture({
    allocatedAmount: 0,
    depositAmount: 0,
    financialStatus: "waived",
    owedBalanceAmount: 0,
    owedDepositAmount: 0,
    totalAmount: 0,
  });

  async function mount(
    inscriptions: InscriptionRow[],
    action: (formData: FormData) => unknown = () => null,
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          action: async ({ request }) => action(await request.formData()),
          loader: () => loaderDataFixture({ inscriptions }),
          Component: function Route() {
            return (
              <ChoreographyFinanceDetailView
                loaderData={
                  useLoaderData() as ChoreographyFinanceDetailLoaderData
                }
              />
            );
          },
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function button(label: string) {
    return (
      [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      ) ?? null
    );
  }

  function confirmationText() {
    return document.querySelector('[role="alertdialog"]')?.textContent ?? "";
  }

  // `Bonificar` stays enabled while the row holds money: the click answers
  // with how much and how to clear it, instead of an alert in the dialog.
  test("answers Bonificar while the inscription holds money with how much and how to clear it", async () => {
    await mount([inscriptionFixture()]);

    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).not.toContain("Para bonificarla");
    expect(button("Bonificar")?.disabled).toBe(false);
    expect(button("Quitar dinero")?.disabled).toBe(false);

    await clickReactDomButton("Bonificar", { exact: true });

    expect(confirmationText()).toContain(
      "No se puede bonificar la inscripción",
    );
    expect(confirmationText()).toContain("Tiene $ 3.000 asignados.");
    expect(confirmationText()).not.toContain("¿Bonificar la inscripción?");
  });

  // Review regression: a fully paid row opens straight on removal, and the
  // waiver was missing from that shape.
  test("tells a fully paid row how to become waivable from its removal shape", async () => {
    await mount([
      inscriptionFixture({
        allocatedAmount: 10000,
        financialStatus: "paidInFull",
        owedBalanceAmount: 0,
      }),
    ]);

    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).toContain(removeDescription);
    expect(button("Bonificar")?.disabled).toBe(false);

    await clickReactDomButton("Bonificar", { exact: true });

    expect(confirmationText()).toContain("Tiene $ 10.000 asignados.");
  });

  // Review regression: a withdrawn row was offered a waiver the server refuses.
  test("offers no waiver on a withdrawn inscription", async () => {
    await mount([{ ...emptyRow, withdrawn: true }]);

    await clickReactDomButton("Bruno Benítez");

    expect(button("Bonificar")).toBeNull();
    expect(dialogText()).not.toContain("bonificar");
  });

  test("asks before waiving an inscription with no money, and posts the waiver", async () => {
    const posted: FormData[] = [];
    await mount([emptyRow], (formData) => {
      posted.push(formData);
      return { status: "success", message: "Inscripción bonificada." };
    });

    await clickReactDomButton("Bruno Benítez");
    expect(dialogText()).not.toContain("Para bonificarla");
    await clickReactDomButton("Bonificar", { exact: true });

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    expect(confirmationText()).toContain("¿Bonificar la inscripción?");
    expect(confirmationText()).toContain(
      "La inscripción de Bruno Benítez pasa a ser gratis: no adeuda nada y participa igual que las demás.",
    );

    await clickReactDomButton("Bonificar", { exact: true });

    expect(posted.map((formData) => formData.get("intent"))).toEqual([
      "waive-inscription",
    ]);
    expect(posted[0]?.get("inscriptionId")).toBe("inscription_orphan");
  });

  test("opens a waived inscription on its waiver, with no money fields", async () => {
    await mount([waivedRow]);

    await clickReactDomButton("Bruno Benítez");

    expect(dialogText()).toContain("Inscripción bonificada: no adeuda nada.");
    expect(dialogText()).toContain(
      "No se le puede asignar dinero. Para cobrarla, quitá la bonificación.",
    );
    expect(document.querySelector("input#inscription-amount")).toBeNull();
    expect(
      [
        ...document.querySelectorAll(
          '[data-slot="dialog-content"] button:not([data-slot="dialog-close"])',
        ),
      ].map((candidate) => candidate.textContent?.trim()),
    ).toEqual(["Quitar bonificación", "Cerrar"]);
  });

  test("asks before removing the waiver, as a destructive Quitar", async () => {
    const posted: FormData[] = [];
    await mount([waivedRow], (formData) => {
      posted.push(formData);
      return { status: "success", message: "Bonificación quitada." };
    });

    await clickReactDomButton("Bruno Benítez");
    await clickReactDomButton("Quitar bonificación");

    expect(confirmationText()).toContain("¿Quitar la bonificación?");
    expect(confirmationText()).toContain(
      "La inscripción de Bruno Benítez vuelve al precio que le corresponde y queda con la seña pendiente. Si la coreografía ya tiene número de presentación, lo conserva.",
    );
    expect(button("Quitar")?.dataset.variant).toBe("destructive");

    await clickReactDomButton("Quitar", { exact: true });

    expect(posted.map((formData) => formData.get("intent"))).toEqual([
      "unwaive-inscription",
    ]);
  });
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

  test('filters by the badge the "Estado" column shows, "Retirada" included', async () => {
    await mount();

    // `Retirada` replaces the money status, so filtering by `Pagada` does not
    // bring the withdrawn one in even though its money is complete.
    await applyTableFilter("Estado", "Pagada");
    expect(renderedDancerNames()).toEqual(["Ana López"]);

    await applyTableFilter("Estado", "Retirada");
    expect(renderedDancerNames()).toEqual(["Carla Díaz"]);
  });

  test("filters the waived inscriptions on `Bonificada`", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <ChoreographyFinanceDetailView
              loaderData={loaderDataFixture({
                inscriptions: [
                  ...roster,
                  inscriptionFixture({
                    allocatedAmount: 0,
                    dancerId: "dancer_4",
                    financialStatus: "waived",
                    firstName: "Dana",
                    inscriptionId: "inscription_4",
                    lastName: "Suárez",
                    owedBalanceAmount: 0,
                  }),
                ],
              })}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await applyTableFilter("Estado", "Bonificada");
    expect(renderedDancerNames()).toEqual(["Dana Suárez"]);
  });
});

function searchInput(): HTMLInputElement {
  const input = document.querySelector(
    'input[placeholder="Buscar por bailarín"]',
  );

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected the inscriptions search field to be rendered.");
  }

  return input;
}

/** The names the table shows, in order. */
function renderedDancerNames() {
  return [
    ...document.querySelectorAll('[aria-label="Inscripciones"] tbody tr'),
  ].map((row) => row.querySelector("td")?.textContent?.trim() ?? "");
}

/** The price picker of the allocation shape, named by the one it is. */
async function openPriceSelect() {
  await openRadixSelect(document.querySelector("#inscription-price"));
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

/** The button that confirms the allocation, to read its disabled state. */
function guardarButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Guardar",
    ) ?? null
  );
}

/** The button that confirms the removal, to read its disabled state. */
function quitarButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Quitar",
    ) ?? null
  );
}

/**
 * The descriptions that tell one shape of the dialog from another: the title is
 * the dancer's name in all three, so the header no longer says which one it is.
 */
const allocateDescription =
  "El dinero se asigna desde el saldo disponible de la academia.";
const removeDescription =
  "El dinero que se quita vuelve al saldo disponible de la academia.";

/** Text of the open dialog, so it is not confused with the table's behind it. */
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
    dancerDiscountAmount: 0,
    dancerId: "dancer_1",
    depositAmount: 3000,
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
      choreographyNumber: 1,
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

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { seminarInscriptionFinanceRowFixture } from "@/lib/finances/seminar-inscriptions.test-support";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { loadSeminarInscriptionFinances } from "./server";
import { SeminarInscriptionFinancesView } from "./view";

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: (message: string) => toastSuccess(message),
    warning: vi.fn(),
  },
}));

type LoaderData = Extract<
  Awaited<ReturnType<typeof loadSeminarInscriptionFinances>>,
  { selectedEventId: string }
>;

const listPath = "/administracion/finanzas/seminarios";

/**
 * Three inscriptions across two academies and two instructors. Deposit, total
 * and owed balance per row: 5.000 / 10.000 / 5.000 for the first (academy_1,
 * seminar_1), 10.000 / 20.000 / 20.000 for the second (academy_2, seminar_2)
 * and 10.000 / 20.000 / 12.000 for the third (academy_1, seminar_2).
 */
const inscriptions = [
  seminarInscriptionFinanceRowFixture(),
  seminarInscriptionFinanceRowFixture({
    academyId: "academy_2",
    academyName: "Academia Sur",
    allocatedAmount: 0,
    depositAmount: 10000,
    financialStatus: "depositPending",
    firstName: "Luz",
    inscriptionId: "seminar_inscription_2",
    instructorName: "Bruno Díaz",
    lastName: "Suárez",
    owedBalanceAmount: 20000,
    owedDepositAmount: 10000,
    scheduledDate: "2026-10-11",
    seminarId: "seminar_2",
    totalAmount: 20000,
  }),
  seminarInscriptionFinanceRowFixture({
    allocatedAmount: 8000,
    depositAmount: 10000,
    financialStatus: "depositPending",
    firstName: "Nicolás",
    inscriptionId: "seminar_inscription_3",
    instructorName: "Bruno Díaz",
    lastName: "Prado",
    owedBalanceAmount: 12000,
    owedDepositAmount: 2000,
    scheduledDate: "2026-10-11",
    seminarId: "seminar_2",
    totalAmount: 20000,
  }),
];

describe("SeminarInscriptionFinancesView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(
    search = "",
    answer: () => unknown = () => ({
      message: "Dinero asignado.",
      status: "success",
    }),
  ) {
    const loaderData: LoaderData = {
      inscriptions,
      priceOptionsByInscription: {},
      selectedEventId: "event_1",
    };
    const router = createMemoryRouter(
      [
        {
          path: listPath,
          action: answer,
          element: <SeminarInscriptionFinancesView loaderData={loaderData} />,
        },
      ],
      { initialEntries: [`${listPath}${search}`] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("sums the three metrics over every row when nothing narrows the list", async () => {
    await mount();

    expect(metricCardText("Seña total")).toContain("$ 25.000");
    expect(metricCardText("Total")).toContain("$ 50.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 37.000");
  });

  test("narrows rows and metrics to one academy", async () => {
    await mount("?academia=academy_1");

    expect(columnValues("Inscripto")).toEqual(["Ana López", "Nicolás Prado"]);
    expect(metricCardText("Seña total")).toContain("$ 15.000");
    expect(metricCardText("Total")).toContain("$ 30.000");
    expect(metricCardText("Saldo adeudado")).toContain("$ 17.000");
  });

  test("narrows rows and metrics to one instructor", async () => {
    await mount("?docente=Bruno%20D%C3%ADaz");

    expect(columnValues("Inscripto")).toEqual(["Luz Suárez", "Nicolás Prado"]);
    expect(metricCardText("Saldo adeudado")).toContain("$ 32.000");
  });

  test("narrows rows and metrics to one status", async () => {
    await mount("?estado=depositMet");

    expect(columnValues("Inscripto")).toEqual(["Ana López"]);
    expect(metricCardText("Saldo adeudado")).toContain("$ 5.000");
  });

  test("searches by the person's name alone", async () => {
    await mount("?busqueda=suarez");

    expect(columnValues("Inscripto")).toEqual(["Luz Suárez"]);
    expect(metricCardText("Saldo adeudado")).toContain("$ 20.000");
  });

  test("opens the money dialog from the person's name, the row's only control", async () => {
    await mount();

    const rowControls = [
      ...document.querySelectorAll("tbody a, tbody button"),
    ].map((control) => (control.textContent ?? "").trim());
    expect(rowControls).toEqual(["Ana López", "Luz Suárez", "Nicolás Prado"]);

    await clickReactDomButton("Luz Suárez", { exact: true });

    expect(
      document.querySelector('[role="dialog"] h2')?.textContent?.trim(),
    ).toBe("Luz Suárez");
  });

  // The list stays put after a write (a dialog over a list does not
  // redirect), so the success comes back as an answer: it is toasted and the
  // dialog closes.
  test("toasts a write that went through and closes the dialog", async () => {
    await mount();

    await clickReactDomButton("Ana López", { exact: true });
    await updateReactDomForm(() => {
      setInputValue(amountInput(), "1000");
    });
    await clickReactDomButton("Guardar");
    await waitFor(() => document.querySelector('[role="dialog"]') === null);

    await waitFor(() => toastSuccess.mock.calls.length > 0);
    expect(toastSuccess).toHaveBeenCalledWith("Dinero asignado.");
  });
});

function headerLabels() {
  return [...document.querySelectorAll("thead th")].map((header) =>
    (header.textContent ?? "").trim(),
  );
}

/** Every cell of one column, read by header label rather than by position. */
function columnValues(header: string) {
  const columnIndex = headerLabels().indexOf(header);

  if (columnIndex === -1) {
    throw new Error(`Expected a "${header}" column to be rendered.`);
  }

  return [...document.querySelectorAll("tbody tr")].map((row) =>
    (row.querySelectorAll("td")[columnIndex]?.textContent ?? "").trim(),
  );
}

function amountInput(): HTMLInputElement {
  const input = document.querySelector("input#inscription-amount");

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected the amount field to be rendered.");
  }

  return input;
}

function metricCardText(title: string) {
  const card = [...document.querySelectorAll('[data-slot="card"]')].find(
    (candidate) =>
      candidate
        .querySelector('[data-slot="card-title"]')
        ?.textContent?.trim() === title,
  );

  if (!card) {
    throw new Error(`Expected the "${title}" metric card to be rendered.`);
  }

  return card.textContent ?? "";
}

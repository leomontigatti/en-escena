/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PaymentDetailRouteView } from "./view";
import type { loadPaymentDetail } from "./server";
import { deletePaymentIntent, updatePaymentIntent } from "./shared";

type LoaderData = Awaited<ReturnType<typeof loadPaymentDetail>>;
type DetailViewProps = Parameters<typeof PaymentDetailRouteView>[0];

const renderer = createReactDomTestRenderer();

describe("PaymentDetailRouteView", () => {
  afterEach(renderer.cleanup);

  test("renders an editable payment form for admins", async () => {
    await renderDetailIntoDocument();

    expect(document.querySelector("h2")?.textContent).toBe("Pago # 00001");
    expect(document.body.textContent).toContain("Academia Norte");
    expect(document.body.textContent).toContain("Fecha de pago");
    expect(document.body.textContent).toContain("Referencia");
    expect(document.body.textContent).toContain("Monto");
    expect(document.body.textContent).toContain("Medio de pago");
    expect(document.body.textContent).toContain("Nota interna");
    expect(document.body.textContent).toContain("Guardar");
    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        `input[name="intent"][value="${updatePaymentIntent}"]`,
      ),
    ).not.toBeNull();
  });

  // The one figure the detail could not answer before: of what came in, how much
  // is still free. Alone above the form, because `Monto` is already a field.
  test("shows what is still free on the payment", async () => {
    await renderDetailIntoDocument({
      loaderData: buildLoaderData({
        allocatedAmount: 4000,
        availableAmount: 6000,
      }),
    });

    expect(document.body.textContent).toContain("Disponible");
    expect(document.body.textContent).toContain("$ 6.000");
  });

  test("keeps payment details read-only for auditors", async () => {
    await renderDetailIntoDocument({
      loaderData: buildLoaderData({
        canDelete: false,
        canEdit: false,
      }),
    });

    expect(document.querySelector("h2")?.textContent).toBe("Pago # 00001");
    expect(getInputValue("Academia")).toBe("Academia Norte");
    expect(document.body.textContent).not.toContain("Guardar");
    expect(document.body.textContent).not.toContain("¿Eliminar el pago?");
  });

  test("asks only for delete confirmation without a reason field", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
    });

    expect(document.body.textContent).toContain("¿Eliminar el pago?");
    expect(document.body.textContent).toContain("Esta acción es irreversible.");
    expect(document.body.textContent).toContain(
      "El saldo disponible de la academia baja por el monto del pago.",
    );
    expect(document.body.textContent).not.toContain("Motivo");
    expect(
      document.querySelector(
        `input[name="intent"][value="${deletePaymentIntent}"]`,
      ),
    ).not.toBeNull();
    expect(document.querySelector('textarea[name="reason"]')).toBeNull();
  });

  test("names each affected unit with its amount, its un-crossings and the places a seminar loses", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
      loaderData: buildLoaderData({
        affectedUnits: [
          {
            allocatedAmount: 4000,
            id: "cho_1",
            kind: "choreography",
            name: "Coreografía Uno",
            resultingStatus: "depositPending",
            uncrossingInscriptionCount: 2,
          },
          {
            allocatedAmount: 1500,
            id: "cho_2",
            kind: "choreography",
            name: "Coreografía Dos",
            resultingStatus: null,
            uncrossingInscriptionCount: 0,
          },
          {
            allocatedAmount: 2500,
            id: "cho_3",
            kind: "choreography",
            name: "Coreografía Tres",
            resultingStatus: "depositMet",
            uncrossingInscriptionCount: 1,
          },
          {
            allocatedAmount: 9000,
            id: "sem_1",
            kind: "seminar",
            losingPlaceCount: 1,
            name: "Abril Sosa",
          },
        ],
      }),
    });

    const text = document.body.textContent ?? "";

    // The money leaves the pool: the copy cannot promise it returns to the
    // available balance, because the payment backing it goes with it.
    expect(text).toContain(
      "Ese dinero no vuelve al saldo disponible de la academia.",
    );
    expect(text).not.toContain("pool");

    expect(text).toContain("Coreografía Uno");
    expect(text).toContain("$ 4.000");
    expect(text).toContain("2 inscripciones se verían afectadas.");
    expect(text).toContain("La coreografía quedaría con la seña pendiente.");
    expect(text).not.toContain("umbral");

    // With nothing uncrossed, no resulting state is named.
    expect(text).toContain("Coreografía Dos");
    expect(text).toContain("$ 1.500");
    expect(text).not.toContain("0 inscripciones");

    expect(text).toContain("1 inscripción se vería afectada.");
    expect(text).toContain("La coreografía quedaría señada.");

    // The seminar is in the same list, named by its instructor, and what it
    // loses is places rather than a threshold.
    expect(text).toContain("Abril Sosa");
    expect(text).toContain("$ 9.000");
    expect(text).toContain("1 inscripción pierde su lugar");
  });
});

async function renderDetailIntoDocument(input: Partial<DetailViewProps> = {}) {
  const loaderData = input.loaderData ?? buildLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/pagos/payment_1",
        action: async () => null,
        element: (
          <PaymentDetailRouteView
            actionData={input.actionData}
            initialDeleteDialogOpen={input.initialDeleteDialogOpen}
            loaderData={loaderData}
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/pagos/payment_1"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function buildLoaderData(overrides: Partial<LoaderData> = {}): LoaderData {
  const payment = overrides.payment ?? buildPayment();

  return {
    academies: [
      {
        contactName: "Academia Norte",
        id: "academy_1",
        name: "Academia Norte",
      },
      { contactName: "Academia Sur", id: "academy_2", name: "Academia Sur" },
    ],
    affectedUnits: [],
    allocatedAmount: 0,
    availableAmount: payment.amount,
    canDelete: true,
    canEdit: true,
    payment,
    selectedEventId: "event_1",
    values: {
      academyId: payment.academyId,
      amount: String(payment.amount),
      internalNote: payment.internalNote ?? "",
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference ?? "",
    },
    ...overrides,
  };
}

function getInputValue(labelText: string) {
  const label = Array.from(document.querySelectorAll("label")).find(
    (element) => element.textContent === labelText,
  );

  if (!label) {
    throw new Error(`Expected label ${labelText}.`);
  }

  const input = document.getElementById(
    label.getAttribute("for") ?? "",
  ) as HTMLInputElement | null;

  return input?.value;
}

function buildPayment(
  overrides: Partial<LoaderData["payment"]> = {},
): LoaderData["payment"] {
  return {
    academyId: "academy_1",
    academyName: "Academia Norte",
    amount: 5000,
    eventId: "event_1",
    id: "payment_1",
    internalNote: "Primer pago",
    paymentDate: "2026-03-15",
    paymentMethod: "transferencia",
    paymentNumber: 1,
    reference: "TRX-001",
    ...overrides,
  };
}

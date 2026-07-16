/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AdministracionPagoDetalleRouteView } from "./view";
import type { loadAdminPaymentDetail } from "./server";
import { deleteAdminPaymentIntent, updateAdminPaymentIntent } from "./shared";

type LoaderData = Awaited<ReturnType<typeof loadAdminPaymentDetail>>;
type DetailViewProps = Parameters<typeof AdministracionPagoDetalleRouteView>[0];

const renderer = createReactDomTestRenderer();

describe("AdministracionPagoDetalleRouteView", () => {
  afterEach(renderer.cleanup);

  test("renders an editable payment form for admins", async () => {
    await renderDetailIntoDocument();

    expect(document.body.textContent).toContain("Detalle pago");
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
        `input[name="intent"][value="${updateAdminPaymentIntent}"]`,
      ),
    ).not.toBeNull();
  });

  test("keeps payment details read-only for auditors", async () => {
    await renderDetailIntoDocument({
      loaderData: buildLoaderData({
        canDelete: false,
        canEdit: false,
      }),
    });

    expect(document.body.textContent).toContain("Detalle pago");
    expect(getInputValue("Academia")).toBe("Academia Norte");
    expect(document.body.textContent).not.toContain("Guardar");
    expect(document.body.textContent).not.toContain("Eliminar pago");
  });

  test("asks only for delete confirmation without a reason field", async () => {
    await renderDetailIntoDocument({
      initialDeleteDialogOpen: true,
    });

    expect(document.body.textContent).toContain("Eliminar pago");
    expect(document.body.textContent).toContain("Esta acción es irreversible.");
    expect(document.body.textContent).not.toContain("Motivo");
    expect(
      document.querySelector(
        `input[name="intent"][value="${deleteAdminPaymentIntent}"]`,
      ),
    ).not.toBeNull();
    expect(document.querySelector('textarea[name="reason"]')).toBeNull();
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
          <AdministracionPagoDetalleRouteView
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
    allocatedAmount: 0,
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

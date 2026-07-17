/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { PortalAcademyPaymentsRouteView } from "./view";
import type { loadPortalAcademyPayments } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadPortalAcademyPayments>>;
type PaymentRow = Extract<
  LoaderData,
  { activeEvent: object }
>["payments"][number];

describe("PortalAcademyPaymentsRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("shows each payment number without linking to a detail", async () => {
    await renderPortalPayments(portalPaymentsLoaderDataFixture());

    expect(document.body.textContent).toContain("0001");
    expect(document.querySelector('a[href^="/portal/pagos/"]')).toBeNull();
  });

  test("shows the payment reference and method", async () => {
    await renderPortalPayments(portalPaymentsLoaderDataFixture());

    const text = document.body.textContent ?? "";

    expect(text).toContain("Referencia");
    expect(text).toContain("TRF-9");
    expect(text).toContain("Medio de pago");
    expect(text).toContain("Transferencia");
  });

  test("finds a payment by its reference", async () => {
    await renderPortalPayments(
      portalPaymentsLoaderDataFixture({
        payments: [
          paymentRowFixture({ id: "payment_1", reference: "TRF-9" }),
          paymentRowFixture({
            id: "payment_2",
            paymentNumber: 2,
            reference: "MP-4",
          }),
        ],
      }),
    );

    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="Buscar pago por referencia o número"]',
    );

    if (!search) {
      throw new Error("Expected the payments search input to be rendered.");
    }

    await updateReactDomForm(() => {
      setInputValue(search, "MP-4");
    });

    const text = document.body.textContent ?? "";

    expect(text).toContain("MP-4");
    expect(text).not.toContain("TRF-9");
  });

  test("shows the empty state when the academy has no payments", async () => {
    await renderPortalPayments(
      portalPaymentsLoaderDataFixture({ payments: [] }),
    );

    expect(document.body.textContent).toContain(
      "Todavía no hay pagos registrados",
    );
  });
});

async function renderPortalPayments(loaderData: LoaderData) {
  const renderer = createReactDomTestRenderer();
  const router = createMemoryRouter(
    [
      {
        path: "/portal/pagos",
        element: <PortalAcademyPaymentsRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/portal/pagos"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function portalPaymentsLoaderDataFixture(
  overrides: Partial<Extract<LoaderData, { activeEvent: object }>> = {},
): LoaderData {
  return {
    activeEvent: {
      id: "event_1",
      name: "Evento 2026",
      active: true,
      registrationStartsAt: new Date("2026-01-01T00:00:00Z"),
      registrationEndsAt: new Date("2026-02-01T00:00:00Z"),
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-02T00:00:00Z"),
    },
    payments: [paymentRowFixture({ id: "payment_1", reference: "TRF-9" })],
    ...overrides,
  };
}

function paymentRowFixture(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "payment",
    amount: 10000,
    paymentDate: "2026-02-10",
    paymentMethod: "transferencia",
    paymentNumber: 1,
    reference: "TRF-9",
    ...overrides,
  };
}

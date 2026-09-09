/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PaymentInstructions } from "@/lib/finances/payment-instructions";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getReactDomTexts,
  type ReactDomTestRenderer,
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
    await renderPortalPayments(renderer, portalPaymentsLoaderDataFixture());

    expect(document.body.textContent).toContain("0001");
    expect(document.querySelector('a[href^="/portal/pagos/"]')).toBeNull();
  });

  // Selecting payments is the administration panel's, not the academy's: the
  // panel ticks rows to re-scope its two money cards, and this list has no such
  // figures to re-scope. The academy reads its own payments and nothing else.
  test("does not offer row selection", async () => {
    await renderPortalPayments(renderer, portalPaymentsLoaderDataFixture());

    expect(
      document.querySelector('[aria-label="Seleccionar fila"]'),
    ).toBeNull();
    expect(
      document.querySelector('[aria-label="Seleccionar todas las filas"]'),
    ).toBeNull();
  });

  test("shows the payment reference and method", async () => {
    await renderPortalPayments(renderer, portalPaymentsLoaderDataFixture());

    const text = document.body.textContent ?? "";

    expect(text).toContain("Referencia");
    expect(text).toContain("TRF-9");
    expect(text).toContain("Medio de pago");
    expect(text).toContain("Transferencia");
  });

  test("finds a payment by its reference", async () => {
    await renderPortalPayments(
      renderer,
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
      renderer,
      portalPaymentsLoaderDataFixture({ payments: [] }),
    );

    expect(document.body.textContent).toContain(
      "Todavía no hay pagos registrados",
    );
  });
});

// Renders through the renderer the suite already cleans in `afterEach`: a
// renderer created here would leave its root mounted, and the router
// subscription it keeps alive can schedule work after jsdom teardown.
async function renderPortalPayments(
  renderer: ReactDomTestRenderer,
  loaderData: LoaderData,
) {
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
    paymentInstructions: null,
    payments: [paymentRowFixture({ id: "payment_1", reference: "TRF-9" })],
    ...overrides,
  };
}

/** The valid fixtures the PRD pins; the check digits are real. */
function paymentInstructionsFixture(
  overrides: Partial<PaymentInstructions> = {},
): PaymentInstructions {
  return {
    cbu: "0070099330004512345678",
    alias: "mi.alias-01",
    holderName: "En Escena Producciones SRL",
    bankName: "Banco Galicia",
    holderCuit: "30-71234567-1",
    text: "Poné el nombre de tu academia en la referencia.",
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

describe("PortalAcademyPaymentsRouteView payment instructions", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("renders the alert as the first child of the page, in both branches", async () => {
    for (const payments of [
      [],
      [paymentRowFixture({ id: "payment_1", reference: "TRF-9" })],
    ]) {
      await renderPortalPayments(
        renderer,
        portalPaymentsLoaderDataFixture({
          payments,
          paymentInstructions: paymentInstructionsFixture(),
        }),
      );

      const section = document.querySelector("section");
      const alert = document.querySelector('[data-slot="alert"]');

      expect(alert?.textContent).toContain("Instrucciones de pago");
      // The header is the section's own; the alert is the first child passed in.
      expect(section?.children[1]).toBe(alert);

      renderer.cleanup();
    }
  });

  test("renders no alert when nothing is loaded or there is no active event", async () => {
    await renderPortalPayments(renderer, portalPaymentsLoaderDataFixture());

    expect(document.querySelector('[data-slot="alert"]')).toBeNull();

    renderer.cleanup();

    await renderPortalPayments(renderer, {
      activeEvent: null,
      paymentInstructions: null,
      payments: [],
    });

    expect(document.querySelector('[data-slot="alert"]')).toBeNull();
  });

  test("pairs the identifiers and closes the gaps a partial set leaves", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture({
          alias: null,
          bankName: null,
        }),
      }),
    );

    expect(getReactDomTexts("dt")).toEqual(["CBU/CVU", "Titular"]);
  });

  test("renders the CUIT inside the titular cell, joined by a middle dot", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture(),
      }),
    );

    expect(getReactDomTexts("dd")).toContain(
      "En Escena Producciones SRL · CUIT 30-71234567-1",
    );
    expect(getReactDomTexts("dt")).toEqual([
      "CBU/CVU",
      "Alias",
      "Titular",
      "Banco",
    ]);
  });

  test("drops the missing half of the titular line", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture({ holderCuit: null }),
      }),
    );

    expect(getReactDomTexts("dd")).toContain("En Escena Producciones SRL");
  });

  // A CBU is not a card number: what is read is what is copied and typed.
  test("renders the CBU/CVU as one unbroken run, never breaking mid-number", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture(),
      }),
    );

    const value = document.querySelector("dd span");

    expect(value?.textContent).toBe("0070099330004512345678");
    expect(value?.className).toContain("font-mono");
    expect(value?.className).toContain("tabular-nums");
    expect(value?.className).not.toContain("break-all");
  });

  test("shows the free text and no grid when only the text is loaded", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: {
          cbu: null,
          alias: null,
          holderName: null,
          bankName: null,
          holderCuit: null,
          text: "Escribinos y te pasamos los datos.",
        },
      }),
    );

    expect(document.querySelector("dl")).toBeNull();
    expect(document.body.textContent).toContain(
      "Escribinos y te pasamos los datos.",
    );
  });

  test("splits paragraphs on blank lines, keeps single newlines and does not autolink", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture({
          cbu: null,
          alias: null,
          holderName: null,
          bankName: null,
          holderCuit: null,
          text: "Primera línea\nsegunda línea\n\nOtro párrafo: https://enescena.com.ar",
        }),
      }),
    );

    const alert = document.querySelector('[data-slot="alert"]');
    const paragraphs = Array.from(alert?.querySelectorAll("p") ?? []);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe("Primera línea\nsegunda línea");
    expect(paragraphs[0]?.className).toContain("whitespace-pre-line");
    expect(paragraphs[1]?.textContent).toContain("https://enescena.com.ar");
    expect(alert?.querySelector("a")).toBeNull();
  });
});

describe("PortalAcademyPaymentsRouteView copy buttons", () => {
  const renderer = createReactDomTestRenderer();
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    renderer.cleanup();
    vi.useRealTimers();
  });

  test("copies the stored value and flips the accessible name back after two seconds", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture(),
      }),
    );

    await clickReactDomButton("Copiar CBU/CVU", { exact: true });

    expect(writeText).toHaveBeenCalledWith("0070099330004512345678");
    expect(
      document.querySelector('[aria-label="CBU/CVU copiado"]'),
    ).not.toBeNull();
    // Inline feedback, not a toast: copying never reaches the server.
    expect(document.querySelector("[data-sonner-toast]")).toBeNull();

    await updateReactDomForm(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      document.querySelector('[aria-label="Copiar CBU/CVU"]'),
    ).not.toBeNull();
  });

  test("copies the alias without touching the CBU/CVU button", async () => {
    await renderPortalPayments(
      renderer,
      portalPaymentsLoaderDataFixture({
        paymentInstructions: paymentInstructionsFixture(),
      }),
    );

    await clickReactDomButton("Copiar Alias", { exact: true });

    expect(writeText).toHaveBeenCalledWith("mi.alias-01");
    expect(
      document.querySelector('[aria-label="Alias copiado"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Copiar CBU/CVU"]'),
    ).not.toBeNull();
  });
});

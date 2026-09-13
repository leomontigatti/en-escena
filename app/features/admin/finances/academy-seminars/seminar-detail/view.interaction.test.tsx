/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { loadSeminarFinanceDetail } from "./server";
import { SeminarFinanceDetailView } from "./view";

// The loader returns a union: with no active event there is no seminar. The
// fixtures always model the branch with an event.
type SeminarFinanceDetailLoaderData = Extract<
  Awaited<ReturnType<typeof loadSeminarFinanceDetail>>,
  { selectedEventId: string }
>;

describe("SeminarFinanceDetailView actions menu", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(
    overrides: Partial<SeminarFinanceDetailLoaderData> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <SeminarFinanceDetailView
              loaderData={loaderDataFixture(overrides)}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("offers `Emitir factura` behind the `...` menu and not as a loose button", async () => {
    await mount();

    expect(
      document.querySelector('button[aria-label="Acciones"]'),
    ).not.toBeNull();

    await openActionsMenu();

    expect(findEmissionItem()).not.toBeUndefined();
  });

  // With nothing left to bill the menu is still there: what gets disabled is the
  // option, for the same reason it does on the choreography detail.
  test("disables the emission with nothing left to bill", async () => {
    await mount({ invoicing: { billableAmount: 0, canEmit: false } });

    await openActionsMenu();

    expect(findEmissionItem()?.getAttribute("aria-disabled")).toBe("true");
  });
});

function findEmissionItem() {
  return [...document.querySelectorAll('[role="menuitem"]')].find((candidate) =>
    candidate.textContent?.includes("Emitir factura"),
  );
}

async function openActionsMenu() {
  const button = document.querySelector('button[aria-label="Acciones"]');

  if (!button) {
    throw new Error("Expected the actions menu button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    ctrlKey: false,
  });
  Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

function loaderDataFixture(
  overrides: Partial<SeminarFinanceDetailLoaderData> = {},
): SeminarFinanceDetailLoaderData {
  return {
    academy: {
      contactName: "Academia Centro",
      id: "academy_1",
      name: "Academia Centro",
      phone: "11-5555-5555",
    },
    availableBalanceAmount: 7000,
    inscriptions: [],
    invoicing: { billableAmount: 4000, canEmit: true },
    priceOptionsByInscription: {},
    seminar: {
      allocatedAmount: 5000,
      anomalies: [],
      availablePlaces: 3,
      depositAmount: { status: "complete", amount: 5000 },
      financialStatus: "depositMet",
      id: "seminar_1",
      instructorName: "Abril Sosa",
      owedBalanceAmount: { status: "complete", amount: 5000 },
      owedDepositAmount: { status: "complete", amount: 0 },
      registrationCount: 1,
      scheduledDate: "2026-10-10",
      totalAmount: { status: "complete", amount: 10000 },
    },
    selectedEventId: "event_1",
    ...overrides,
  };
}

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { OwnerMovementRow } from "./server";
import { OwnerMovementsTab } from "./tab";

const movements: OwnerMovementRow[] = [
  {
    amount: 600,
    date: "2026-04-03",
    id: "refund_1",
    internalNote: "Se retiró",
    kind: "refund",
    method: "efectivo",
    number: 1,
    reference: "REC-1",
    version: "2026-04-03T12:00:00.000Z",
  },
  {
    amount: 2000,
    date: "2026-04-01",
    id: "payment_1",
    internalNote: null,
    kind: "payment",
    method: "transferencia",
    number: 1,
    reference: "TRX-1",
    version: "2026-04-01T12:00:00.000Z",
  },
];

describe("OwnerMovementsTab", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderTab(
    submissions: FormData[] = [],
    settle: () => Promise<unknown> = async () => undefined,
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          action: async ({ request }) => {
            submissions.push(await request.formData());
            await settle();

            return null;
          },
          element: (
            <OwnerMovementsTab
              availableBalanceAmount={1500}
              movements={movements}
            />
          ),
        },
      ],
      {
        initialEntries: ["/administracion/finanzas/academy_1?tipo=movimientos"],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("a refund's number opens its dialog, capped at the balance plus its own amount; a payment's opens none", async () => {
    const submissions: FormData[] = [];
    await renderTab(submissions);

    const [refundRow, paymentRow] = document.querySelectorAll("tbody tr");
    expect(paymentRow?.querySelector("button")).toBeNull();

    await clickReactDomButton("00001", { exact: true, within: refundRow });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector("h2")?.textContent).toBe("Reembolso # 00001");
    expect(dialog?.textContent).toContain(
      "Hasta $ 2.100, el saldo disponible más su monto actual.",
    );
    expect(
      document.querySelector<HTMLInputElement>("#edit-refund-reference")?.value,
    ).toBe("REC-1");
    expect(
      dialog?.querySelector("[name=academyId], [name=eventId]"),
    ).toBeNull();

    const amount = document.querySelector<HTMLInputElement>(
      "#edit-refund-amount",
    );
    await updateReactDomForm(() => setInputValue(amount!, "2101"));
    await clickReactDomButton("Guardar", { exact: true, within: dialog });

    await waitFor(() =>
      (dialog?.textContent ?? "").includes(
        "El reembolso no puede superar $ 2.100, el saldo disponible más su monto actual.",
      ),
    );
    expect(submissions).toEqual([]);

    await updateReactDomForm(() => setInputValue(amount!, "2100"));
    await clickReactDomButton("Guardar", { exact: true, within: dialog });

    await waitFor(() => submissions.length === 1);
    expect(Object.fromEntries(submissions[0]!)).toMatchObject({
      amount: "2100",
      intent: "update-refund",
      refundId: "refund_1",
      version: "2026-04-03T12:00:00.000Z",
    });
  });

  test("deleting a refund asks first, then posts its id and version", async () => {
    const submissions: FormData[] = [];
    await renderTab(submissions);

    const [refundRow] = document.querySelectorAll("tbody tr");
    await clickReactDomButton("00001", { exact: true, within: refundRow });
    await clickReactDomButton("Eliminar", {
      exact: true,
      within: document.querySelector('[role="dialog"]'),
    });

    const confirmation = document.querySelector('[role="alertdialog"]');
    expect(confirmation?.textContent).toContain(
      "Esta acción elimina el reembolso # 00001 y devuelve $ 600 al saldo disponible.",
    );
    expect(submissions).toEqual([]);

    await clickReactDomButton("Eliminar", {
      exact: true,
      within: confirmation,
    });

    await waitFor(() => submissions.length === 1);
    expect(Object.fromEntries(submissions[0]!)).toEqual({
      intent: "delete-refund",
      refundId: "refund_1",
      version: "2026-04-03T12:00:00.000Z",
    });
  });

  test("`Guardar` cannot post an edit while a deletion runs", async () => {
    const submissions: FormData[] = [];
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await renderTab(submissions, () => pending);

    const [refundRow] = document.querySelectorAll("tbody tr");
    await clickReactDomButton("00001", { exact: true, within: refundRow });
    const dialog = document.querySelector('[role="dialog"]');
    const amount = document.querySelector<HTMLInputElement>(
      "#edit-refund-amount",
    );
    await updateReactDomForm(() => setInputValue(amount!, "500"));
    await clickReactDomButton("Eliminar", { exact: true, within: dialog });
    await clickReactDomButton("Eliminar", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });
    await waitFor(() => submissions.length === 1);

    expect(
      findButton("Guardar", { exact: true, within: dialog })?.disabled,
    ).toBe(true);

    release();
  });

  describe("a refund date after today", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // Today is 15 April 2026 in Córdoba; the calendar opens on that month.
    async function pickApril(trigger: string, day: number) {
      await act(async () => {
        document.querySelector<HTMLButtonElement>(trigger)?.click();
      });
      const dayButton = document.querySelector<HTMLButtonElement>(
        `button[data-day="${new Date(2026, 3, day).toLocaleDateString("es")}"]`,
      );

      if (!dayButton) {
        throw new Error(`The calendar offers no day ${day}.`);
      }

      await act(async () => {
        dayButton.click();
      });
    }

    test("is refused in the edit dialog before anything posts", async () => {
      vi.useFakeTimers({
        now: new Date("2026-04-15T15:00:00Z"),
        toFake: ["Date"],
      });
      const submissions: FormData[] = [];
      await renderTab(submissions);

      const [refundRow] = document.querySelectorAll("tbody tr");
      await clickReactDomButton("00001", { exact: true, within: refundRow });
      const dialog = document.querySelector('[role="dialog"]');
      await pickApril("#edit-refund-date", 20);
      await clickReactDomButton("Guardar", { exact: true, within: dialog });

      await waitFor(() =>
        (dialog?.textContent ?? "").includes(
          "La fecha del reembolso no puede ser futura.",
        ),
      );
      expect(submissions).toEqual([]);
    });
  });
});

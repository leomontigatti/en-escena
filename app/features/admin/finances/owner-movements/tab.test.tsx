/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
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

  async function renderTab(submissions: FormData[] = []) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/finanzas/:academyId",
          action: async ({ request }) => {
            submissions.push(await request.formData());

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

  test("tells a refund from a payment by its badge, each with its own number and a positive amount", async () => {
    await renderTab();

    const rows = [...document.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell) =>
        (cell.textContent ?? "").trim(),
      ),
    );

    expect(rows).toEqual([
      [
        "Reembolso",
        "00001",
        "3 de abril de 2026",
        "REC-1",
        "Efectivo",
        "$ 600",
      ],
      [
        "Pago",
        "00001",
        "1 de abril de 2026",
        "TRX-1",
        "Transferencia",
        "$ 2.000",
      ],
    ]);
  });

  test("the refund dialog states the `Saldo disponible` as its maximum and posts nothing above it", async () => {
    const submissions: FormData[] = [];
    await renderTab(submissions);

    await clickReactDomButton("Registrar reembolso");

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "Hasta $ 1.500, el saldo disponible.",
    );

    const amount = document.querySelector<HTMLInputElement>("#refund-amount");
    await updateReactDomForm(() => setInputValue(amount!, "1501"));
    await clickReactDomButton("Registrar", { exact: true, within: dialog });

    await waitFor(() =>
      (dialog?.textContent ?? "").includes(
        "El reembolso no puede superar el saldo disponible de $ 1.500.",
      ),
    );
    expect(submissions).toEqual([]);

    await updateReactDomForm(() => setInputValue(amount!, "1500"));
    await clickReactDomButton("Registrar", { exact: true, within: dialog });

    await waitFor(() => submissions.length === 1);
    expect(submissions[0]?.get("intent")).toBe("register-refund");
    expect(submissions[0]?.get("amount")).toBe("1500");
  });

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
});

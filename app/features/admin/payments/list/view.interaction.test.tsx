/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  waitFor,
} from "@/lib/test-support/react-dom";

import { MovementsListRouteView } from "./view";
import {
  movementsListLoaderDataFixture,
  paymentRowFixture,
  refundRowFixture,
} from "./view.test-support";

describe("a refund row of the movements list", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  async function renderList(input: {
    canWrite: boolean;
    submissions?: FormData[];
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/movimientos",
          action: async ({ request }) => {
            input.submissions?.push(await request.formData());

            return null;
          },
          element: (
            <MovementsListRouteView
              loaderData={movementsListLoaderDataFixture({
                canWrite: input.canWrite,
                rows: [refundRowFixture(), paymentRowFixture()],
              })}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/movimientos"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    const [refundRow] = document.querySelectorAll("tbody tr");
    await clickReactDomButton("00001", { exact: true, within: refundRow });

    return document.querySelector('[role="dialog"]');
  }

  // The cap is the refund's owner's, which this list reads per row: there is
  // no page-wide `Saldo disponible` on an event-wide list.
  test("opens the shared dialog capped by its owner's balance, posting to the list", async () => {
    const submissions: FormData[] = [];
    const dialog = await renderList({ canWrite: true, submissions });

    expect(dialog?.querySelector("h2")?.textContent).toBe("Reembolso # 00001");
    expect(dialog?.textContent).toContain(
      "Hasta $ 4.000, el saldo disponible más su monto actual.",
    );

    await clickReactDomButton("Eliminar", { exact: true, within: dialog });
    await clickReactDomButton("Eliminar", {
      exact: true,
      within: document.querySelector('[role="alertdialog"]'),
    });

    await waitFor(() => submissions.length === 1);
    expect(Object.fromEntries(submissions[0]!)).toEqual({
      intent: "delete-refund",
      refundId: "refund_1",
      version: "2026-03-17T12:00:00.000Z",
    });
  });

  // The auditor reads everything and changes nothing: the same figures, every
  // field locked, and `Cerrar` the only way out.
  test("only reads for the auditor", async () => {
    const dialog = await renderList({ canWrite: false });
    const buttons = [...(dialog?.querySelectorAll("button") ?? [])].map(
      (button) => (button.textContent ?? "").trim(),
    );

    expect(
      document.querySelector<HTMLInputElement>("#edit-refund-reference")?.value,
    ).toBe("REC-1");
    for (const id of [
      "edit-refund-date",
      "edit-refund-reference",
      "edit-refund-amount",
      "edit-refund-method",
      "edit-refund-internal-note",
    ]) {
      expect(
        document.querySelector<HTMLInputElement>(`#${id}`)?.disabled,
        id,
      ).toBe(true);
    }
    expect(buttons).toContain("Cerrar");
    expect(buttons).not.toContain("Eliminar");
    expect(buttons).not.toContain("Guardar");
    expect(dialog?.textContent).not.toContain("Hasta $");

    await clickReactDomButton("Cerrar", { exact: true, within: dialog });

    await waitFor(() => document.querySelector('[role="dialog"]') === null);
  });
});

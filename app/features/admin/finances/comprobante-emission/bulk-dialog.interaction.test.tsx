/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { BulkEmission, BulkEmissionActionData } from "./bulk";
import { BulkEmissionDialog } from "./bulk-dialog";

const choreographies = [
  { id: "a", choreographyNumber: 1, name: "Aire" },
  { id: "b", choreographyNumber: 2, name: "Brisa" },
  { id: "c", choreographyNumber: 3, name: "Calma" },
  { id: "d", choreographyNumber: 4, name: "Duna" },
];

const bulkEmission: BulkEmission = {
  plans: {
    a: { status: "ready", kind: "factura_c", amount: 10000 },
    b: { status: "ready", kind: "factura_c", amount: 20000 },
    c: { status: "ready", kind: "nota_debito_c", amount: 5000 },
    d: {
      status: "skipped",
      reasons: ["Alguna inscripción todavía no cubrió su seña."],
    },
  },
  cbteFch: {
    today: "2026-07-22",
    floors: {
      factura_c: { floor: "2026-07-12", description: "12/07/2026" },
      nota_debito_c: { floor: "2026-07-12", description: "12/07/2026" },
    },
  },
  blocked: null,
};

describe("BulkEmissionDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // An action that holds each request until the test answers it, so what the
  // operator does while one is in flight can be driven.
  function heldAction() {
    const posted: Array<Record<string, string>> = [];
    const pending: Array<(answer: BulkEmissionActionData) => void> = [];

    return {
      posted,
      async answer(answer: BulkEmissionActionData) {
        await waitFor(() => pending.length > 0);
        pending.shift()?.(answer);
      },
      async action({ request }: { request: Request }) {
        posted.push(
          Object.fromEntries(await request.formData()) as Record<
            string,
            string
          >,
        );

        return await new Promise<BulkEmissionActionData>((resolve) =>
          pending.push(resolve),
        );
      },
    };
  }

  async function mount(action: ReturnType<typeof heldAction>["action"]) {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          action,
          element: (
            <BulkEmissionDialog
              bulkEmission={bulkEmission}
              choreographies={choreographies}
              onOpenChange={() => {}}
              open
              selectedIds={["a", "b", "c", "d"]}
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function rowText(name: string): string {
    const row = [...document.querySelectorAll("tr")].find((candidate) =>
      candidate.textContent?.includes(name),
    );

    return row?.textContent ?? "";
  }

  test("`Detener` lets the emission in flight finish and sends no other", async () => {
    const held = heldAction();
    await mount(held.action);

    await clickReactDomButton("Emitir", { exact: true });
    await waitFor(() => held.posted.length === 1);
    await clickReactDomButton("Detener");
    await held.answer({
      status: "emitted",
      number: "0001-00000007",
      recovered: false,
    });

    await waitFor(() => document.body.textContent?.includes("Cerrar") ?? false);
    expect(held.posted).toEqual([
      {
        intent: "emit-comprobante",
        confirm: "irreversible",
        choreographyId: "a",
        kind: "factura_c",
        amount: "10000",
        cbteFch: "2026-07-22",
      },
    ]);
    expect(rowText("Aire")).toContain("0001-00000007");
    expect(rowText("Brisa")).toContain("Sin intentar");
    expect(rowText("Calma")).toContain("Sin intentar");
    expect(rowText("Duna")).toContain("Salteada");
  });

  test("a series left unverified halts the run on the contingency alert", async () => {
    const held = heldAction();
    await mount(held.action);

    await clickReactDomButton("Emitir", { exact: true });
    await held.answer({
      status: "emitted",
      number: "0001-00000007",
      recovered: false,
    });
    await held.answer({
      status: "warning",
      contingency: {
        status: "unverified",
        message: "Factura C 0001-00000008 quedó sin confirmar con ARCA.",
        ptoVta: 1,
        cbteTipo: 11,
        cbteNro: 8,
      },
    });

    await waitFor(
      () => document.body.textContent?.includes("Verificar ahora") ?? false,
    );
    expect(held.posted.map((payload) => payload.choreographyId)).toEqual([
      "a",
      "b",
    ]);
    expect(rowText("Calma")).toContain("Sin intentar");
  });
});

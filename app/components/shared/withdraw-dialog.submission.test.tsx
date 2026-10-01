/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { WithdrawDialog } from "@/components/shared/withdraw-dialog";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

/** Same reason as the delete dialog's submission test (#1358). */
describe("WithdrawDialog submission", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("disables the withdrawal and `Cancelar` while the route action handles it", async () => {
    const received: FormData[] = [];
    const openChanges: boolean[] = [];
    let releaseAction = () => {};
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreography_1",
          action: async ({ request }) => {
            received.push(await request.formData());
            await new Promise<void>((resolve) => {
              releaseAction = resolve;
            });

            return null;
          },
          element: (
            <WithdrawDialog
              confirmLabel="Dar de baja"
              consequence="Conserva el dinero asignado."
              description="Se va a dar de baja la inscripción."
              intentValue="withdraw-inscription"
              onOpenChange={(nextOpen) => openChanges.push(nextOpen)}
              open
              recordId="inscription_1"
              title="¿Dar de baja la inscripción?"
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreography_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await clickReactDomButton("Dar de baja");
    await settle();

    expect(received.map((body) => Object.fromEntries(body))).toEqual([
      {
        confirmDeletion: "inscription_1",
        id: "inscription_1",
        intent: "withdraw-inscription",
      },
    ]);
    expect(getButton("Dar de baja").disabled).toBe(true);
    expect(getButton("Cancelar").disabled).toBe(true);

    expect(openChanges).toEqual([]);

    releaseAction();
    await settle();

    expect(openChanges).toEqual([false]);
    expect(getButton("Dar de baja").disabled).toBe(false);
  });
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

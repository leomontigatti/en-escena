/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

import { WithdrawDialog } from "./withdraw-dialog";

describe("WithdrawDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  async function renderDialog() {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreography_1",
          action: async () => null,
          element: (
            <WithdrawDialog
              confirmLabel="Dar de baja"
              consequence="Conserva el dinero asignado."
              description="Se va a dar de baja la inscripción."
              intentValue="withdraw-inscription"
              onOpenChange={() => {}}
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
  }

  test("disables `Cancelar` with the withdrawal while its submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "withdraw-inscription");
    formData.set("id", "inscription_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDialog();

    expect(getButton("Dar de baja").disabled).toBe(true);
    expect(getButton("Cancelar").disabled).toBe(true);
  });

  test("offers both buttons while nothing is in flight", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDialog();

    expect(getButton("Dar de baja").disabled).toBe(false);
    expect(getButton("Cancelar").disabled).toBe(false);
  });
});

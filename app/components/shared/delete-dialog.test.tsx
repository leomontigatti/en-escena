/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
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

import { DeleteDialog } from "./delete-dialog";

describe("DeleteDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  async function renderDialog(
    props: Partial<ComponentProps<typeof DeleteDialog>> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/categorias/category_1",
          action: async () => null,
          element: (
            <DeleteDialog
              description="Se va a eliminar la categoría."
              intentValue="delete-category"
              onOpenChange={() => {}}
              open
              recordId="category_1"
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/categorias/category_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("renders as an alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDialog();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete-category");
    formData.set("id", "category_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDialog();

    expect(getButton("Eliminar").disabled).toBe(true);
  });

  test("hides the destructive action and surfaces the blocked info when blocked", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDialog({
      isBlocked: true,
      blockedTitle: "No se puede eliminar esta categoría",
      blockedDescription: "Tiene coreografías asociadas.",
    });

    expect(document.body.textContent).toContain(
      "No se puede eliminar esta categoría",
    );
    expect(document.body.textContent).toContain(
      "Tiene coreografías asociadas.",
    );
    expect(
      Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Eliminar"),
      ),
    ).toBe(false);
  });

  test("renders the details slot", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDialog({
      details: <p>Coreografía afectada: Vals</p>,
    });

    expect(document.body.textContent).toContain("Coreografía afectada: Vals");
  });
});

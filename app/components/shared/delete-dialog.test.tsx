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

import { DeleteDialog } from "./delete-dialog";

describe("DeleteDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
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
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/categorias/category_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getButton("Eliminar").disabled).toBe(true);
  });
});

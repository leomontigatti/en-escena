/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { DeleteDialog } from "@/components/shared/delete-dialog";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

/**
 * The submission goes through the router rather than the document (#1358):
 * a plain `<form>` posts the whole page, which `useNavigation()` never sees,
 * so the pending state these tests observe only exists on the router's path.
 */
describe("DeleteDialog submission", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("disables `Eliminar` and `Cancelar` while the route action handles the delete", async () => {
    const received: FormData[] = [];
    const openChanges: boolean[] = [];
    let releaseAction = () => {};
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/categorias/category_1",
          action: async ({ request }) => {
            received.push(await request.formData());
            await new Promise<void>((resolve) => {
              releaseAction = resolve;
            });

            return null;
          },
          element: (
            <DeleteDialog
              description="Se va a eliminar la categoría."
              intentValue="delete-category"
              onOpenChange={(nextOpen) => openChanges.push(nextOpen)}
              open
              recordId="category_1"
              title="¿Eliminar la categoría?"
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/categorias/category_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await clickReactDomButton("Eliminar");
    await settle();

    expect(received.map((body) => Object.fromEntries(body))).toEqual([
      {
        confirmDeletion: "category_1",
        id: "category_1",
        intent: "delete-category",
      },
    ]);
    expect(getButton("Eliminar").disabled).toBe(true);
    expect(getButton("Cancelar").disabled).toBe(true);

    expect(openChanges).toEqual([]);

    releaseAction();
    await settle();

    // The document reload used to take the dialog with it; on the router's
    // path the dialog closes itself once its submission settles.
    expect(openChanges).toEqual([false]);
    expect(getButton("Eliminar").disabled).toBe(false);
    expect(getButton("Cancelar").disabled).toBe(false);
  });
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

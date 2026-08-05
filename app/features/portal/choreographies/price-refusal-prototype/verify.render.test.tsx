/** @vitest-environment jsdom */
/**
 * THROWAWAY PROTOTYPE — smoke check for ticket #623.
 *
 * Not a spec: it only proves every variant × case combination renders and that
 * the refusal actually fires, so the switcher is worth opening in a browser.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PriceRefusalPrototypeView } from "./view";
import { prototypeCaseKeys } from "./fixtures";
import { prototypeVariantKeys } from "./switcher";

describe("price refusal prototype render", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }

    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  async function render(variant: string, caso: string) {
    const router = createMemoryRouter(
      [{ path: "/prototipo", element: <PriceRefusalPrototypeView /> }],
      { initialEntries: [`/prototipo?variant=${variant}&caso=${caso}`] },
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    return document.body.textContent ?? "";
  }

  for (const variant of prototypeVariantKeys) {
    for (const caso of prototypeCaseKeys) {
      test(`variant ${variant} renders case ${caso}`, async () => {
        const text = await render(variant, caso);

        expect(text).toContain("Nueva coreografía");
        expect(text).toContain("Siguiente");
      });
    }
  }

  test("the refusal only fires once the roster is submitted", async () => {
    await render("B", "unico");

    expect(document.body.textContent).not.toContain(
      "Todavía no podemos registrar esta coreografía",
    );

    const next = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Siguiente"),
    );
    expect(next).toBeDefined();

    await act(async () => {
      next?.click();
    });

    expect(document.body.textContent).toContain(
      "Todavía no podemos registrar esta coreografía",
    );
  });
});

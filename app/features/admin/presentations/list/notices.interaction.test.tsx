/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PresentationDayTabs } from "./notices";
import type { PresentationListResult } from "./shared";

describe("PresentationDayTabs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // The days are a filter on one list: Back leaves the list instead of
  // stepping through the days, and a page number belongs to the day it was
  // read on.
  test("switches the day in place, from the first page", async () => {
    const router = createMemoryRouter(
      [
        { path: "/administracion", element: null },
        {
          path: "/administracion/presentaciones",
          element: (
            <PresentationDayTabs
              loaderData={
                {
                  days: ["2026-05-01", "2026-05-02"],
                } as PresentationListResult
              }
            />
          ),
        },
      ],
      {
        initialEntries: [
          "/administracion",
          "/administracion/presentaciones?pagina=3&advertencias=con",
        ],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await selectTab(2);
    await selectTab(1);

    expect(router.state.location.search).toBe(
      "?advertencias=con&dia=2026-05-01",
    );
    expect(
      document
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent?.trim(),
    ).not.toBe("Todos");

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/administracion");
  });

  // Radix activates a trigger on `mousedown`, not on the click after it.
  async function selectTab(index: number) {
    await act(async () => {
      document
        .querySelectorAll('[role="tab"]')
        [index]!.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
    });
  }
});

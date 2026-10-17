/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PresentationDayTabs, PresentationNotices } from "./notices";
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
            >
              {null}
            </PresentationDayTabs>
          ),
        },
      ],
      {
        initialEntries: [
          "/administracion",
          "/administracion/presentaciones?pagina=3&estado=advertencias",
        ],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await selectTab(1);

    expect(router.state.location.search).toBe(
      "?estado=advertencias&dia=2026-05-02",
    );

    // The first day is the one a URL naming none opens on.
    await selectTab(0);

    expect(router.state.location.search).toBe("?estado=advertencias");

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

describe("PresentationNotices", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  function mountNotices(search: string, status: "advertencias" | null) {
    const loaderData = {
      canWrite: true,
      filters: { status },
      hasPresentations: true,
      unorderedCount: 0,
      warnedCount: 2,
    } as PresentationListResult;
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentaciones",
          element: (
            <PresentationNotices
              loaderData={loaderData}
              needsNumberSortToDrag={false}
              onOrderAutomatically={() => {}}
            />
          ),
        },
      ],
      { initialEntries: [`/administracion/presentaciones${search}`] },
    );

    return { router };
  }

  function seeButton() {
    return [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Ver",
    );
  }

  // `Ver` is the `Estado` filter's `Con advertencias`, applied from the notice;
  // once it is applied, the filter's own control takes it off.
  test("applies `Con advertencias` from the warnings notice, and offers nothing once applied", async () => {
    const { router } = mountNotices("?pagina=2&dia=2026-05-02", null);

    await renderer.renderAsync(<RouterProvider router={router} />);
    await act(async () => {
      seeButton()?.click();
    });

    expect(router.state.location.search).toBe(
      "?dia=2026-05-02&estado=advertencias",
    );

    renderer.cleanup();
    const filtered = mountNotices("?estado=advertencias", "advertencias");
    await renderer.renderAsync(<RouterProvider router={filtered.router} />);

    expect(seeButton()).toBeUndefined();
    expect(
      [...document.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
      ),
    ).not.toContain("Ver todas");
  });
});

/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { PresentationsListView } from "./view";
import type { PresentationListItem, PresentationListResult } from "./shared";

const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastError(message),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("the participation list moved by hand", () => {
  const renderer = createReactDomTestRenderer();
  const submissions: Record<string, string>[] = [];
  let actionResponse: unknown = { status: "moved" };

  beforeEach(() => {
    submissions.length = 0;
    actionResponse = { status: "moved" };
    toastError.mockClear();
  });

  afterEach(renderer.cleanup);

  async function mount(overrides: Partial<PresentationListResult> = {}) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/presentacion",
          action: async ({ request }) => {
            const formData = await request.formData();
            submissions.push(
              Object.fromEntries(
                [...formData.entries()].map(([key, value]) => [
                  key,
                  String(value),
                ]),
              ),
            );

            return actionResponse;
          },
          element: (
            <PresentationsListView loaderData={buildLoaderData(overrides)} />
          ),
        },
      ],
      { initialEntries: ["/administracion/presentacion"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  function numberInput(name: string) {
    const input = document.querySelector(
      `input[aria-label="Número de presentación de ${name}"]`,
    );

    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Expected a number input for "${name}".`);
    }

    return input;
  }

  async function pressEnter(input: HTMLInputElement) {
    await updateReactDomForm(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
  }

  test("commits the typed number on Enter", async () => {
    await mount();

    const input = numberInput("Segunda");

    await updateReactDomForm(() => {
      setInputValue(input, "1");
    });
    await pressEnter(input);

    expect(submissions).toEqual([
      {
        coreografia: "choreography-2",
        desde: "2",
        hasta: "1",
        intent: "move-presentation",
      },
    ]);
  });

  test("commits the typed number on blur", async () => {
    await mount();

    const input = numberInput("Segunda");

    await updateReactDomForm(() => {
      setInputValue(input, "1");
      // React's `onBlur` listens for the bubbling `focusout`.
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(submissions).toHaveLength(1);
    expect(submissions[0].hasta).toBe("1");
  });

  test("refuses a number outside the order and submits nothing", async () => {
    await mount();

    const input = numberInput("Segunda");

    await updateReactDomForm(() => {
      setInputValue(input, "9");
    });
    await pressEnter(input);

    expect(submissions).toEqual([]);
    expect(document.body.textContent).toContain("Entre 1 y 2");
  });

  test("offers a late row the place after the last one", async () => {
    await mount({
      presentations: [
        buildItem({ id: "choreography-1", name: "Primera", orderNumber: 1 }),
        buildItem({ id: "choreography-3", name: "Tardía", orderNumber: null }),
      ],
      presentationCount: 1,
      unorderedCount: 1,
    });

    const input = numberInput("Tardía");

    await updateReactDomForm(() => {
      setInputValue(input, "3");
    });
    await pressEnter(input);

    expect(document.body.textContent).toContain("Entre 1 y 2");

    await updateReactDomForm(() => {
      setInputValue(input, "2");
    });
    await pressEnter(input);

    expect(submissions).toEqual([
      {
        coreografia: "choreography-3",
        desde: "",
        hasta: "2",
        intent: "move-presentation",
      },
    ]);
  });

  test("says why a refused move did not happen", async () => {
    actionResponse = {
      message:
        "El orden cambió mientras movías la fila; se actualizó la lista.",
      status: "error",
    };

    await mount();

    const input = numberInput("Segunda");

    await updateReactDomForm(() => {
      setInputValue(input, "1");
    });
    await pressEnter(input);
    await updateReactDomForm(async () => {
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalledWith(
      "El orden cambió mientras movías la fila; se actualizó la lista.",
    );
  });

  test("locks the number before the event's first automatic ordering", async () => {
    await mount({
      hasPresentations: false,
      presentations: [
        buildItem({ id: "choreography-1", name: "Primera", orderNumber: null }),
      ],
      presentationCount: 0,
      unorderedCount: 1,
    });

    const locked = document.querySelector(
      'input[aria-label="Número de presentación"]',
    );

    expect(locked).toBeInstanceOf(HTMLInputElement);
    expect((locked as HTMLInputElement).disabled).toBe(true);
    expect(
      document.querySelector('[aria-label="Mover la presentación"]'),
    ).toBeNull();
  });

  test("hides the drag handles under another sort and says how to get them back", async () => {
    await mount({
      filters: {
        day: null,
        order: { columnId: "orden", direction: "desc" },
        page: 1,
        query: "",
        warnings: null,
      },
    });

    expect(
      document.querySelector('[aria-label="Mover la presentación"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain(
      "Ordená por número para arrastrar.",
    );
  });

  test("moves a row with the keyboard alone, giving it the number it lands on", async () => {
    await mount();

    stubRowRects();

    const handles = document.querySelectorAll(
      '[aria-label="Mover la presentación"]',
    );

    expect(handles).toHaveLength(2);

    const handle = handles[1];

    if (!(handle instanceof HTMLElement)) {
      throw new Error("Expected the drag handle to be an element.");
    }

    await pressKey(handle, "Space");
    await pressKey(handle, "ArrowUp");
    await pressKey(handle, "Space");

    expect(submissions).toEqual([
      {
        coreografia: "choreography-2",
        desde: "2",
        hasta: "1",
        intent: "move-presentation",
      },
    ]);
  });

  /** Drag-and-drop reads `code`, not `key`, so both travel with the event. */
  async function pressKey(element: HTMLElement, code: string) {
    element.focus();

    await act(async () => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code,
          key: code === "Space" ? " " : code,
        }),
      );
      await Promise.resolve();
    });
  }
});

/**
 * Drag-and-drop measures the rows it moves between, and jsdom lays nothing out:
 * each row is given a box of its own so the keyboard sensor has somewhere to go.
 */
function stubRowRects() {
  const rows = [...document.querySelectorAll("tbody tr")];

  for (const [index, row] of rows.entries()) {
    const top = index * 40;

    row.getBoundingClientRect = () =>
      ({
        bottom: top + 40,
        height: 40,
        left: 0,
        right: 600,
        toJSON: () => ({}),
        top,
        width: 600,
        x: 0,
        y: top,
      }) as DOMRect;
  }
}

function buildItem(
  overrides: Partial<PresentationListItem> = {},
): PresentationListItem {
  return {
    academyName: "Academia Sur",
    assignedJudgeIds: [],
    categoryName: "Infantil",
    choreographyNumber: 1,
    financialStatus: "paidInFull",
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    warnings: [],
    ...overrides,
  };
}

function buildLoaderData(
  overrides: Partial<PresentationListResult> = {},
): PresentationListResult {
  return {
    assignableJudges: [],
    assignedJudges: [],
    canOrder: true,
    days: ["2026-05-01"],
    filters: {
      day: null,
      order: { columnId: "orden", direction: "asc" },
      page: 1,
      query: "",
      warnings: null,
    },
    hasAnyRow: true,
    hasPresentations: true,
    presentations: [
      buildItem({ id: "choreography-1", name: "Primera", orderNumber: 1 }),
      buildItem({
        choreographyNumber: 2,
        id: "choreography-2",
        name: "Segunda",
        orderNumber: 2,
      }),
    ],
    presentationCount: 2,
    selectedEventId: "event-1",
    totalCount: 2,
    totalPages: 1,
    unorderedCount: 0,
    warnedCount: 0,
    ...overrides,
  };
}

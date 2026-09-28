/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DataTableTruncatedText } from "@/components/shared/data-table-truncated-text";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

/**
 * jsdom lays nothing out, so each value's widths are set by hand: the width its
 * text needs, and the width its column gives it.
 */
const widths = new Map<string, { content: number; box: number }>();

function getWidths(element: HTMLElement) {
  return widths.get(element.title) ?? { content: 0, box: 0 };
}

let resizeCallbacks: ResizeObserverCallback[] = [];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return getWidths(this).content;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return getWidths(this).box;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  widths.clear();
  resizeCallbacks = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DataTableTruncatedText", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  function getSpan(value: string) {
    const span = renderer
      .getContainer()
      .querySelector<HTMLElement>(`span[title="${value}"]`);

    if (!span) {
      throw new Error(`Expected a truncated text for "${value}".`);
    }

    return span;
  }

  test("draws a value that fits whole, even when it ends at the column's edge", () => {
    widths.set("Modalidad / Submodalidad", { content: 182, box: 182 });

    renderer.render(
      <DataTableTruncatedText value="Modalidad / Submodalidad" />,
    );

    expect(getSpan("Modalidad / Submodalidad").dataset.cut).toBeUndefined();
  });

  test("fades a value that runs past its column", () => {
    widths.set("Academia de Danza del Norte", { content: 240, box: 180 });

    renderer.render(
      <DataTableTruncatedText value="Academia de Danza del Norte" />,
    );

    expect(getSpan("Academia de Danza del Norte").dataset.cut).toBe("");
  });

  test("looks again when the column changes width", () => {
    widths.set("Luna de Papel", { content: 100, box: 180 });
    renderer.render(<DataTableTruncatedText value="Luna de Papel" />);

    expect(getSpan("Luna de Papel").dataset.cut).toBeUndefined();

    widths.set("Luna de Papel", { content: 100, box: 80 });
    act(() => {
      for (const callback of resizeCallbacks) {
        callback([], {} as ResizeObserver);
      }
    });

    expect(getSpan("Luna de Papel").dataset.cut).toBe("");
  });
});

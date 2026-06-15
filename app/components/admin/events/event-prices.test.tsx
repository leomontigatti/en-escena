// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import type { PriceListItem } from "@/lib/events/bases.server";

describe("EventPriceDetailRouteView", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  test("resets the form when rendering a different precio in the same component instance", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    const testWindow = window as Window &
      typeof globalThis & {
        __vite_plugin_react_preamble_installed__?: boolean;
      };
    testWindow.__vite_plugin_react_preamble_installed__ = true;
    window.matchMedia = (() =>
      ({
        addEventListener() {},
        addListener() {},
        dispatchEvent() {
          return false;
        },
        matches: false,
        media: "",
        onchange: null,
        removeEventListener() {},
        removeListener() {},
      })) as typeof window.matchMedia;

    const { EventPriceDetailRouteView } =
      await import("@/components/admin/events/event-prices");

    const firstPrice = createPrice({
      amount: 12000,
      groupType: "solo",
      id: "price_1",
      name: "Precio base",
      scheduleBlockId: null,
      scheduleBlockName: null,
    });
    const secondPrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_2",
      name: "Precio bloque noche",
      scheduleBlockId: "block_2",
      scheduleBlockName: "Noche",
    });
    const loaderData = createLoaderData({
      prices: [firstPrice, secondPrice],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const currentRoot = root;

    await act(async () => {
      currentRoot.render(
        <MemoryRouter>
          <EventPriceDetailRouteView
            loaderData={loaderData}
            priceId={firstPrice.id}
          />
        </MemoryRouter>,
      );
    });

    expect(readInputValue(container, "name")).toBe("Precio base");
    expect(readInputValue(container, "groupType")).toBe("solo");
    expect(readInputValue(container, "amount")).toBe("12000");
    expect(readInputValue(container, "scheduleBlockId")).toBe("");

    await act(async () => {
      currentRoot.render(
        <MemoryRouter>
          <EventPriceDetailRouteView
            loaderData={loaderData}
            priceId={secondPrice.id}
          />
        </MemoryRouter>,
      );
    });

    expect(readInputValue(container, "name")).toBe("Precio bloque noche");
    expect(readInputValue(container, "groupType")).toBe("duo");
    expect(readInputValue(container, "amount")).toBe("18000");
    expect(readInputValue(container, "scheduleBlockId")).toBe("block_2");
  });
});

function readInputValue(container: HTMLElement, name: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );

  if (!input) {
    throw new Error(`Could not find input named ${name}.`);
  }

  return input.value;
}

function createLoaderData({
  prices,
}: {
  prices: PriceListItem[];
}): EventBasesLoaderData {
  return {
    email: "admin@example.com",
    events: [{ active: true, id: "event_1", name: "Evento 2026" }],
    selectedEventId: "event_1",
    modalities: [],
    submodalities: [],
    experienceLevels: [],
    categories: [],
    scheduleBlocks: [
      {
        id: "block_1",
        eventId: "event_1",
        name: "Mañana",
        scheduledDate: "2026-10-10",
        startTime: "10:00",
        totalCapacity: 10,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modalityIds: [],
        modalities: [],
        occupiedCapacity: 0,
        scheduleEntries: [],
      },
      {
        id: "block_2",
        eventId: "event_1",
        name: "Noche",
        scheduledDate: "2026-10-10",
        startTime: "20:00",
        totalCapacity: 10,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modalityIds: [],
        modalities: [],
        occupiedCapacity: 0,
        scheduleEntries: [],
      },
    ],
    prices,
  };
}

function createPrice({
  amount,
  groupType,
  id,
  name,
  scheduleBlockId,
  scheduleBlockName,
}: {
  amount: number;
  groupType: PriceListItem["groupType"];
  id: string;
  name: string;
  scheduleBlockId: string | null;
  scheduleBlockName: string | null;
}): PriceListItem {
  return {
    id,
    eventId: "event_1",
    name,
    groupType,
    amount,
    scheduleBlockId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    scheduleBlock: scheduleBlockId
      ? {
          id: scheduleBlockId,
          name: scheduleBlockName ?? "Bloque horario",
          scheduledDate: "2026-10-10",
          startTime: "20:00",
        }
      : null,
  };
}

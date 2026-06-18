// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { EventPriceDetailRouteView as EventPriceDetailRouteViewType } from "@/components/admin/events/event-prices";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import type { PriceListItem } from "@/lib/events/bases.server";

describe("EventPriceDetailRouteView", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let EventPriceDetailRouteView: typeof EventPriceDetailRouteViewType;

  beforeAll(async () => {
    installReactTestEnvironment();

    ({ EventPriceDetailRouteView } =
      await import("@/components/admin/events/event-prices"));
  }, 20_000);

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
    const firstPrice = createPrice({
      amount: 12000,
      groupType: "solo",
      id: "price_1",
      paymentDeadline: "2026-05-31",
      scheduleBlockId: null,
      scheduleBlockName: null,
    });
    const secondPrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_2",
      paymentDeadline: "2026-06-30",
      scheduleBlockId: "block_2",
      scheduleBlockName: "Noche",
    });
    const loaderData = createLoaderData({
      prices: [firstPrice, secondPrice],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderPriceDetailRoute({
      loaderData,
      priceId: firstPrice.id,
      root,
      EventPriceDetailRouteView,
    });

    expect(readInputValue(container, "groupType")).toBe("solo");
    expect(readInputValue(container, "amount")).toBe("12000");
    expect(readInputValue(container, "paymentDeadline")).toBe("2026-05-31");
    expect(readInputValue(container, "scheduleBlockId")).toBe("");

    await renderPriceDetailRoute({
      loaderData,
      priceId: secondPrice.id,
      root,
      EventPriceDetailRouteView,
    });

    expect(readInputValue(container, "groupType")).toBe("duo");
    expect(readInputValue(container, "amount")).toBe("18000");
    expect(readInputValue(container, "paymentDeadline")).toBe("2026-06-30");
    expect(readInputValue(container, "scheduleBlockId")).toBe("block_2");
  });
});

function installReactTestEnvironment() {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const testWindow = window as Window &
    typeof globalThis & {
      __vite_plugin_react_preamble_installed__?: boolean;
    };
  testWindow.__vite_plugin_react_preamble_installed__ = true;

  window.matchMedia = (() => ({
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
}

async function renderPriceDetailRoute({
  EventPriceDetailRouteView,
  loaderData,
  priceId,
  root,
}: {
  EventPriceDetailRouteView: typeof EventPriceDetailRouteViewType;
  loaderData: EventBasesLoaderData;
  priceId: string;
  root: ReturnType<typeof createRoot>;
}) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <EventPriceDetailRouteView loaderData={loaderData} priceId={priceId} />
      </MemoryRouter>,
    );
  });
}

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
  paymentDeadline,
  scheduleBlockId,
  scheduleBlockName,
}: {
  amount: number;
  groupType: PriceListItem["groupType"];
  id: string;
  paymentDeadline: string;
  scheduleBlockId: string | null;
  scheduleBlockName: string | null;
}): PriceListItem {
  return {
    id,
    eventId: "event_1",
    groupType,
    amount,
    paymentDeadline,
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

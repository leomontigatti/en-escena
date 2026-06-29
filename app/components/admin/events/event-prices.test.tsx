// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { EventPriceDetailRouteView as EventPriceDetailRouteViewType } from "@/components/admin/events/event-prices";
import type { EventPricesRouteView as EventPricesRouteViewType } from "@/components/admin/events/event-prices";
import type { getPriceDisplayName as GetPriceDisplayName } from "@/components/admin/events/event-prices";
import type { EventBasesLoaderData } from "@/lib/admin/events/event-bases.server";
import type { PriceListItem } from "@/lib/events/bases.server";

describe("EventPriceDetailRouteView", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let EventPriceDetailRouteView: typeof EventPriceDetailRouteViewType;
  let EventPricesRouteView: typeof EventPricesRouteViewType;
  let getPriceDisplayName: typeof GetPriceDisplayName;

  beforeAll(async () => {
    installReactTestEnvironment();

    ({ EventPriceDetailRouteView, EventPricesRouteView, getPriceDisplayName } =
      await import("@/components/admin/events/event-prices"));
  }, 30_000);

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
      name: "Precio Solo",
      paymentDeadline: "2026-05-31",
      scheduleId: null,
      scheduleName: null,
    });
    const secondPrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_2",
      name: "Precio Duo",
      paymentDeadline: "2026-06-30",
      scheduleId: "block_2",
      scheduleName: "Noche",
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
    expect(readInputValue(container, "name")).toBe("Precio Solo");
    expect(readInputValue(container, "amount")).toBe("12000");
    expect(readInputValue(container, "paymentDeadline")).toBe("2026-05-31");
    expect(readInputValue(container, "scheduleId")).toBe("");

    await renderPriceDetailRoute({
      loaderData,
      priceId: secondPrice.id,
      root,
      EventPriceDetailRouteView,
    });

    expect(readInputValue(container, "groupType")).toBe("duo");
    expect(readInputValue(container, "name")).toBe("Precio Duo");
    expect(readInputValue(container, "amount")).toBe("18000");
    expect(readInputValue(container, "paymentDeadline")).toBe("2026-06-30");
    expect(readInputValue(container, "scheduleId")).toBe("block_2");
  });

  test("formats the breadcrumb display name with group type, schedule and deadline", () => {
    const price = createPrice({
      amount: 18000,
      groupType: "solo",
      id: "price_1",
      name: "Precio Solo",
      paymentDeadline: "2026-11-10",
      scheduleId: "block_1",
      scheduleName: "Noche",
    });

    expect(getPriceDisplayName(price)).toBe("Precio Solo");
  });

  test("orders the list by payment deadline by default", async () => {
    const latePrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_late",
      name: "Precio Junio",
      paymentDeadline: "2026-06-30",
      scheduleId: null,
      scheduleName: null,
    });
    const earlyPrice = createPrice({
      amount: 12000,
      groupType: "solo",
      id: "price_early",
      name: "Precio Mayo",
      paymentDeadline: "2026-05-31",
      scheduleId: null,
      scheduleName: null,
    });
    const loaderData = createLoaderData({
      prices: [latePrice, earlyPrice],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderPricesRoute({
      EventPricesRouteView,
      loaderData,
      root,
    });

    const priceNames = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("tbody a"),
    ).map((link) => link.textContent);

    expect(priceNames).toEqual(["Precio Mayo", "Precio Junio"]);
  });

  test("uses derived labels as link names for unnamed prices in the list", async () => {
    const unnamedBasePrice = createPrice({
      amount: 12000,
      groupType: "solo",
      id: "price_base",
      name: "",
      paymentDeadline: "2026-05-31",
      scheduleId: null,
      scheduleName: null,
    });
    const unnamedSchedulePrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_schedule",
      name: "",
      paymentDeadline: "2026-06-30",
      scheduleId: "block_2",
      scheduleName: "Noche",
    });
    const loaderData = createLoaderData({
      prices: [unnamedSchedulePrice, unnamedBasePrice],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderPricesRoute({
      EventPricesRouteView,
      loaderData,
      root,
    });

    expect(container.textContent).toContain("31 de mayo de 2026");
    expect(container.textContent).toContain("30 de junio de 2026");
    expect(container.textContent).toContain("$ 12.000");
    expect(container.textContent).toContain("$ 18.000");

    const priceLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("tbody a"),
    ).map((link) => ({
      label: link.getAttribute("aria-label"),
      text: link.textContent,
    }));

    expect(priceLinks).toEqual([
      {
        label: "Solo - Precio base - hasta 31/5/26",
        text: "",
      },
      {
        label: "Dúo - Noche - hasta 30/6/26",
        text: "",
      },
    ]);
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

  window.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
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

async function renderPricesRoute({
  EventPricesRouteView,
  loaderData,
  root,
}: {
  EventPricesRouteView: typeof EventPricesRouteViewType;
  loaderData: EventBasesLoaderData;
  root: ReturnType<typeof createRoot>;
}) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <EventPricesRouteView loaderData={loaderData} />
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
    requiredDepositPercentage: 30,
    modalities: [],
    submodalities: [],
    experienceLevels: [],
    categories: [],
    schedules: [
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
        scheduleCapacities: [],
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
        scheduleCapacities: [],
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
  paymentDeadline,
  scheduleId,
  scheduleName,
}: {
  amount: number;
  groupType: PriceListItem["groupType"];
  id: string;
  name: string;
  paymentDeadline: string;
  scheduleId: string | null;
  scheduleName: string | null;
}): PriceListItem {
  return {
    id,
    name,
    eventId: "event_1",
    groupType,
    amount,
    paymentDeadline,
    scheduleId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    schedule: scheduleId
      ? {
          id: scheduleId,
          name: scheduleName ?? "Cronograma",
          scheduledDate: "2026-10-10",
          startTime: "20:00",
        }
      : null,
  };
}

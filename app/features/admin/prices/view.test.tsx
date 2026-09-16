// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { EventPriceDetailView as EventPriceDetailRouteViewType } from "@/features/admin/prices/detail/view";
import type { EventPricesListView as EventPricesRouteViewType } from "@/features/admin/prices/list/view";
import type { getPriceDisplayName as GetPriceDisplayName } from "@/features/admin/prices/view-shared";
import type {
  EventPriceDetailLoaderData,
  EventPricesLoaderData,
} from "@/features/admin/prices/shared";
import type { PriceListItem } from "@/lib/events/bases.server";
import { frozenPriceNotice, uncoveredPriceNotice } from "@/lib/prices/guards";

describe("EventPriceDetailRouteView", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let EventPriceDetailRouteView: typeof EventPriceDetailRouteViewType;
  let EventPricesRouteView: typeof EventPricesRouteViewType;
  let getPriceDisplayName: typeof GetPriceDisplayName;

  beforeAll(async () => {
    installReactTestEnvironment();

    const detailModule = await import("@/features/admin/prices/detail/view");
    const listModule = await import("@/features/admin/prices/list/view");
    const viewSharedModule =
      await import("@/features/admin/prices/view-shared");

    EventPriceDetailRouteView = detailModule.EventPriceDetailView;
    EventPricesRouteView = listModule.EventPricesListView;
    getPriceDisplayName = viewSharedModule.getPriceDisplayName;
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

  test("resets the form when rendering a different price in the same component instance", async () => {
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

  test("locks a price inscriptions stored down to its name and says why above the form", async () => {
    const price = {
      ...createPrice({
        amount: 12000,
        groupType: "solo",
        id: "price_1",
        name: "Precio Solo",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
        scheduleName: null,
      }),
      isReferenced: true,
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderPriceDetailRoute({
      loaderData: createLoaderData({ prices: [price] }),
      priceId: price.id,
      root,
      EventPriceDetailRouteView,
    });

    expect(container.textContent).toContain(frozenPriceNotice);
    // The alert sits above the card, not inside the form it explains.
    expect(container.querySelector("form")?.textContent).not.toContain(
      frozenPriceNotice,
    );
    expect(readInputTypes(container, "amount")).toEqual(["hidden"]);
    expect(
      container
        .querySelector('button[role="switch"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  test("keeps the amount of the deadline-less price that holds registration open", async () => {
    const price = {
      ...createPrice({
        amount: 12000,
        groupType: "solo",
        id: "price_1",
        name: "Precio Solo",
        paymentDeadline: "",
        scheduleId: null,
        scheduleName: null,
      }),
      paymentDeadline: null,
      keepsRegistrationOpen: true,
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderPriceDetailRoute({
      loaderData: createLoaderData({ prices: [price] }),
      priceId: price.id,
      root,
      EventPriceDetailRouteView,
    });

    expect(container.textContent).toContain(uncoveredPriceNotice);
    expect(readInputTypes(container, "amount")).not.toContain("hidden");
    expect(readInputTypes(container, "paymentDeadline")).toEqual(["hidden"]);
  });

  // The alert above the form is what says why, so the item can be disabled.
  test.each([
    { flags: { isReferenced: true }, disabled: true },
    { flags: { keepsRegistrationOpen: true }, disabled: true },
    { flags: {}, disabled: false },
  ])(
    "reads `Borrar precio` as disabled: $disabled for $flags",
    async ({ flags, disabled }) => {
      const price = {
        ...createPrice({
          amount: 12000,
          groupType: "solo",
          id: "price_1",
          name: "Precio Solo",
          paymentDeadline: "2026-05-31",
          scheduleId: null,
          scheduleName: null,
        }),
        ...flags,
      };

      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      await renderPriceDetailRoute({
        loaderData: createLoaderData({ prices: [price] }),
        priceId: price.id,
        root,
        EventPriceDetailRouteView,
      });

      expect(await readMenuItemDisabled("Borrar precio")).toBe(disabled);
    },
  );

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

    expect(container.textContent).not.toContain("Seña de coreografía");
    expect(
      container.querySelector('input[name="requiredDepositPercentage"]'),
    ).toBeNull();

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
  loaderData: EventPriceDetailLoaderData;
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
  loaderData: EventPricesLoaderData;
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

/**
 * The actions menu only mounts its items once it opens, and the trigger opens
 * on `pointerdown` rather than on `click`. Both live in a portal on the body.
 */
async function readMenuItemDisabled(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Acciones"]',
  );

  if (!trigger) {
    throw new Error("Expected the actions menu trigger to be rendered.");
  }

  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });

  const item = Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((candidate) => candidate.textContent === label);

  if (!item) {
    throw new Error(`Expected the ${label} menu item to be rendered.`);
  }

  return item.getAttribute("aria-disabled") === "true";
}

function readInputTypes(container: HTMLElement, name: string) {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`),
  ).map((input) => input.type);
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
}): EventPricesLoaderData {
  return {
    selectedEventId: "event_1",
    seminarPrices: [],
    hasSeminars: false,
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
        availablePlaces: 10,
        occupiedCount: 0,
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
        availablePlaces: 10,
        occupiedCount: 0,
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
    isReferenced: false,
    keepsRegistrationOpen: false,
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

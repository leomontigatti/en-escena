// @vitest-environment jsdom

import {
  act,
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { EventPriceDetailView as EventPriceDetailRouteViewType } from "@/features/admin/prices/detail/view";
import type { EventPricesListView as EventPricesRouteViewType } from "@/features/admin/prices/list/view";
import type { getPriceDisplayName as GetPriceDisplayName } from "@/features/admin/prices/view-shared";
import type {
  EventPriceDetailLoaderData,
  EventPricesLoaderData,
} from "@/features/admin/prices/shared";
import type { PriceListItem } from "@/lib/events/bases.server";
import {
  frozenPriceDeleteError,
  uncoveredPriceNotice,
  frozenSpecialPriceNotice,
  frozenPriceNotice,
  frozenPriceUpdateError,
  uncoveredPriceDeleteError,
} from "@/lib/prices/guards";
import { findButton } from "@/lib/test-support/react-dom";

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
      schedules: [],
    });
    const secondPrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_2",
      name: "Precio Duo",
      paymentDeadline: "2026-06-30",
      schedules: [{ id: "block_2", name: "Noche" }],
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
    expect(readInputValues(container, "scheduleIds")).toEqual([]);

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
    expect(readInputValues(container, "scheduleIds")).toEqual(["block_2"]);
  });

  test("locks a price inscriptions stored down to its name and says why above the form", async () => {
    const price = {
      ...createPrice({
        amount: 12000,
        groupType: "solo",
        id: "price_1",
        name: "Precio Solo",
        paymentDeadline: "2026-05-31",
        schedules: [],
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
      frozenPriceUpdateError,
    );
    expect(readInputTypes(container, "amount")).toEqual(["hidden"]);
    expect(
      container
        .querySelector('button[role="switch"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  test("shows every schedule a special price covers, and keeps them editable once an inscription stored it", async () => {
    const price = createPrice({
      amount: 12000,
      groupType: "solo",
      id: "price_1",
      name: "Precio compartido",
      paymentDeadline: "2026-05-31",
      schedules: [
        { id: "block_1", name: "Mañana" },
        { id: "block_2", name: "Noche" },
      ],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderPriceDetailRoute({
      loaderData: createLoaderData({ prices: [price] }),
      priceId: price.id,
      root,
      EventPriceDetailRouteView,
    });

    expect(readInputValues(container, "scheduleIds")).toEqual([
      "block_1",
      "block_2",
    ]);
    expect(container.querySelector("form")?.textContent).toContain("Mañana");
    expect(container.querySelector("form")?.textContent).toContain("Noche");
    expect(readSchedulesFieldDisabled(container)).toBe(false);

    await renderPriceDetailRoute({
      loaderData: createLoaderData({
        prices: [{ ...price, isReferenced: true }],
      }),
      priceId: price.id,
      root,
      EventPriceDetailRouteView,
    });

    // In use, the price is frozen except for its name and its schedules.
    expect(container.textContent).toContain(frozenSpecialPriceNotice);
    expect(readInputTypes(container, "amount")).toEqual(["hidden"]);
    expect(readInputValues(container, "scheduleIds")).toEqual([
      "block_1",
      "block_2",
    ]);
    expect(readSchedulesFieldDisabled(container)).toBe(false);
  });

  test("keeps the amount of the deadline-less price that holds registration open", async () => {
    const price = {
      ...createPrice({
        amount: 12000,
        groupType: "solo",
        id: "price_1",
        name: "Precio Solo",
        paymentDeadline: "",
        schedules: [],
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

  // `Eliminar` is never disabled: a guarded row answers with the blocked
  // acknowledgment and its reason, and the alert above the form speaks of the
  // fields only.
  test.each([
    { flags: { isReferenced: true }, reason: frozenPriceDeleteError },
    {
      flags: { keepsRegistrationOpen: true },
      reason: uncoveredPriceDeleteError,
    },
  ])(
    "answers `Eliminar` on a guarded row with $reason",
    async ({ flags, reason }) => {
      const price = {
        ...createPrice({
          amount: 12000,
          groupType: "solo",
          id: "price_1",
          name: "Precio Solo",
          paymentDeadline: "2026-05-31",
          schedules: [],
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

      expect(container.textContent).not.toContain("no se puede eliminar");

      const item = await openMenuItem("Eliminar");

      expect(item.getAttribute("aria-disabled")).not.toBe("true");

      await act(async () => {
        item.click();
        await Promise.resolve();
      });

      const dialog = document.querySelector('[role="alertdialog"]');

      expect(dialog?.querySelector("h2")?.textContent).toBe(
        "No se puede eliminar el precio",
      );
      expect(dialog?.textContent).toContain(reason);
      expect(dialog?.querySelector('button[type="submit"]')).toBeNull();
    },
  );

  test("formats the breadcrumb display name with group type, schedule and deadline", () => {
    const price = createPrice({
      amount: 18000,
      groupType: "solo",
      id: "price_1",
      name: "Precio Solo",
      paymentDeadline: "2026-11-10",
      schedules: [{ id: "block_1", name: "Noche" }],
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
      schedules: [],
    });
    const earlyPrice = createPrice({
      amount: 12000,
      groupType: "solo",
      id: "price_early",
      name: "Precio Mayo",
      paymentDeadline: "2026-05-31",
      schedules: [],
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
      schedules: [],
    });
    const unnamedSchedulePrice = createPrice({
      amount: 18000,
      groupType: "duo",
      id: "price_schedule",
      name: "",
      paymentDeadline: "2026-06-30",
      schedules: [{ id: "block_2", name: "Noche" }],
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

const SlotContext = createContext<ReactNode>(null);

function Slot() {
  return useContext(SlotContext);
}

/**
 * The form's footer guards the page through the data router, which
 * `MemoryRouter` is not. The router is made once and the view is handed in
 * through context, so rendering again with other props updates the same
 * component instance rather than mounting a new one.
 */
function DataRouterSlot({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createMemoryRouter([{ path: "*", element: <Slot /> }]),
  );

  return (
    <SlotContext.Provider value={children}>
      <RouterProvider router={router} />
    </SlotContext.Provider>
  );
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
      <DataRouterSlot>
        <EventPriceDetailRouteView loaderData={loaderData} priceId={priceId} />
      </DataRouterSlot>,
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
      <DataRouterSlot>
        <EventPricesRouteView loaderData={loaderData} />
      </DataRouterSlot>,
    );
  });
}

/**
 * The actions menu only mounts its items once it opens, and the trigger opens
 * on `pointerdown` rather than on `click`. Both live in a portal on the body.
 */
async function openMenuItem(label: string) {
  const trigger = findButton("Acciones", { exact: true });

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

  return item;
}

function readInputTypes(container: HTMLElement, name: string) {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`),
  ).map((input) => input.type);
}

function readSchedulesFieldDisabled(container: HTMLElement) {
  const trigger = container.querySelector<HTMLElement>(
    '[id^="price-schedules-"]',
  );

  if (!trigger) {
    throw new Error("Could not find the schedules field.");
  }

  return trigger.hasAttribute("disabled");
}

function readInputValues(container: HTMLElement, name: string) {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`),
  ).map((input) => input.value);
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
        awardCeremonyDate: null,
        awardCeremonyTime: null,
        totalCapacity: 10,
        registrationOpen: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modalityIds: [],
        categories: [],
        categoryIds: [],
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
        awardCeremonyDate: null,
        awardCeremonyTime: null,
        totalCapacity: 10,
        registrationOpen: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modalityIds: [],
        categories: [],
        categoryIds: [],
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
  schedules,
}: {
  amount: number;
  groupType: PriceListItem["groupType"];
  id: string;
  name: string;
  paymentDeadline: string;
  schedules: Array<{ id: string; name: string }>;
}): PriceListItem {
  return {
    id,
    name,
    eventId: "event_1",
    groupType,
    amount,
    paymentDeadline,
    isSpecialPrice: schedules.length > 0,
    scheduleIds: schedules.map((schedule) => schedule.id),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    isReferenced: false,
    keepsRegistrationOpen: false,
    schedules: schedules.map((schedule) => ({
      ...schedule,
      scheduledDate: "2026-10-10",
      startTime: "20:00",
    })),
  };
}

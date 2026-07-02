import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { listPrices } from "@/lib/prices/repository.server";
import { listSchedules } from "@/lib/schedules/repository.server";

async function loadEventPriceContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

export async function loadEventPricesListData(request: Request) {
  const eventContext = await loadEventPriceContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    prices: selectedEventId ? await listPrices(selectedEventId) : [],
  };
}

export async function loadEventPriceFormOptions(request: Request) {
  const eventContext = await loadEventPriceContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    schedules: selectedEventId ? await listSchedules(selectedEventId) : [],
  };
}

export async function loadEventPriceDetailData(request: Request) {
  const eventContext = await loadEventPriceContext(request);
  const selectedEventId = eventContext.selectedEventId;

  if (!selectedEventId) {
    return {
      selectedEventId,
      prices: [],
      schedules: [],
    };
  }

  const [prices, schedules] = await Promise.all([
    listPrices(selectedEventId),
    listSchedules(selectedEventId),
  ]);

  return {
    selectedEventId,
    prices,
    schedules,
  };
}

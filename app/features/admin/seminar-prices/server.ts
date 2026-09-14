import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { listSeminarPrices } from "@/lib/seminar-prices/repository.server";

async function loadSeminarPriceContext(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return eventContext;
}

export async function loadSeminarPricesListData(request: Request) {
  const eventContext = await loadSeminarPriceContext(request);
  const selectedEventId = eventContext.selectedEventId;

  return {
    selectedEventId,
    seminarPrices: selectedEventId
      ? await listSeminarPrices(selectedEventId)
      : [],
  };
}

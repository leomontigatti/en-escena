import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  listDancers,
  readDancerFilters,
} from "@/lib/admin/dancers/dancers.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loadAdminDancersList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readDancerFilters(new URL(request.url).searchParams, {
    hasSelectedEvent: eventContext.selectedEventId !== null,
  });
  const listResult = await listDancers({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  return {
    selectedEventId: eventContext.selectedEventId,
    filters: listResult.filters,
    hasAnyDancer: listResult.hasAnyDancer,
    dancers: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

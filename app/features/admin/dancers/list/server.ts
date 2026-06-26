import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  listAdministrativeDancers,
  readAdministrativeDancerFilters,
} from "@/lib/admin/dancers/dancers.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loadAdministrativeDancersList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readAdministrativeDancerFilters(
    new URL(request.url).searchParams,
    {
      hasSelectedEvent: eventContext.selectedEventId !== null,
    },
  );
  const listResult = await listAdministrativeDancers({
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

import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listDancers,
  readDancerFilters,
} from "@/lib/admin/dancers/dancers.server";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { toDancerAppliedListQuery } from "@/lib/admin/dancers/dancers.shared";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";

export async function loadDancersList(request: Request) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readDancerFilters(new URL(request.url).searchParams);
  const listResult = await listDancers({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  redirectToCanonicalListUrl(
    request,
    toDancerAppliedListQuery(listResult.filters, eventContext.selectedEventId),
  );

  return {
    /** False for the auditor, who gets the `Exportar` entry instead. */
    canWrite: canWriteInAdminPanel(user.role),
    selectedEventId: eventContext.selectedEventId,
    filters: listResult.filters,
    hasAnyDancer: listResult.hasAnyDancer,
    dancers: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

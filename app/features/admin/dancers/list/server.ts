import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listDancers,
  readDancerFilters,
} from "@/lib/admin/dancers/dancers.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  dancerListSpec,
  toDancerListFacets,
} from "@/lib/admin/dancers/dancers.shared";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";

export async function loadDancersList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readDancerFilters(new URL(request.url).searchParams);
  const listResult = await listDancers({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  redirectToCanonicalListUrl(request, {
    facets: toDancerListFacets(
      listResult.filters,
      eventContext.selectedEventId,
    ),
    query: {
      order: listResult.filters.order,
      page: listResult.filters.page,
      search: listResult.filters.query,
    },
    spec: dancerListSpec,
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

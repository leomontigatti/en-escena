import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listProfessors,
  readProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  professorListSpec,
  toProfessorListFacets,
} from "@/lib/admin/professors/professors.shared";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";

export async function loadProfessorsList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readProfessorFilters(new URL(request.url).searchParams);
  const listResult = await listProfessors({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  redirectToCanonicalListUrl(request, {
    facets: toProfessorListFacets(
      listResult.filters,
      eventContext.selectedEventId,
    ),
    query: {
      order: listResult.filters.order,
      page: listResult.filters.page,
      search: listResult.filters.query,
    },
    spec: professorListSpec,
  });

  return {
    selectedEventId: eventContext.selectedEventId,
    filters: listResult.filters,
    hasAnyProfessor: listResult.hasAnyProfessor,
    professors: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

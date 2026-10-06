import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listProfessors,
  readProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { toProfessorAppliedListQuery } from "@/lib/admin/professors/professors.shared";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";

export async function loadProfessorsList(request: Request) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readProfessorFilters(new URL(request.url).searchParams);
  const listResult = await listProfessors({
    selectedEventId: eventContext.selectedEventId,
    filters,
  });

  redirectToCanonicalListUrl(
    request,
    toProfessorAppliedListQuery(
      listResult.filters,
      eventContext.selectedEventId,
    ),
  );

  return {
    /** False for the auditor, who gets the `Exportar` entry instead. */
    canWrite: canWriteInAdminPanel(user.role),
    selectedEventId: eventContext.selectedEventId,
    dayOptions: listResult.dayOptions,
    filters: listResult.filters,
    hasAnyProfessor: listResult.hasAnyProfessor,
    professors: listResult.items,
    totalCount: listResult.totalCount,
    totalPages: listResult.totalPages,
  };
}

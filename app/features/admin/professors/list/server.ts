import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listProfessors,
  readProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { requireAdminPanelReader } from "@/lib/auth/internal-access.server";
import { toProfessorAppliedListQuery } from "@/lib/admin/professors/professors.shared";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";

export async function loadProfessorsList(request: Request) {
  const user = await requireAdminPanelReader(request);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readProfessorFilters(readRequestedUrl(request).searchParams);
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

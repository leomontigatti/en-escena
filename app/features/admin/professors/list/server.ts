import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listProfessors,
  readProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loadProfessorsList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readProfessorFilters(new URL(request.url).searchParams, {
    hasSelectedEvent: eventContext.selectedEventId !== null,
  });
  const listResult = await listProfessors({
    selectedEventId: eventContext.selectedEventId,
    filters,
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

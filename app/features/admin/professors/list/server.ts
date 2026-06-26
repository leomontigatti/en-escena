import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  listAdministrativeProfessors,
  readAdministrativeProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loadAdministrativeProfessorsList(request: Request) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readAdministrativeProfessorFilters(
    new URL(request.url).searchParams,
    {
      hasSelectedEvent: eventContext.selectedEventId !== null,
    },
  );
  const listResult = await listAdministrativeProfessors({
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

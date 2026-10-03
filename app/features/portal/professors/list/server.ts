import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { loadPortalEventDocumentDownloadUrls } from "@/lib/events/event-documents.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";

export async function loadPortalProfessorsList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const [professors, documentDownloadUrls] = await Promise.all([
    listAcademyProfessors(academy.id, {
      selectedEventId: eventContext.activeEvent?.id ?? null,
    }),
    loadPortalEventDocumentDownloadUrls(eventContext.activeEvent?.id ?? null),
  ]);

  return {
    documentDownloadUrls,
    professors,
  };
}

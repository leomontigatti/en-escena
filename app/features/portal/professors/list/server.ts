import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { loadEventDocumentDownloadUrls } from "@/lib/events/event-documents.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";
import { createDefaultEventDocumentStorage } from "@/lib/storage/event-documents.server";
import { handleCreateProfessorAction } from "@/features/portal/professors/create/server";
import { createProfessorIntent } from "@/features/portal/professors/create/shared";

export async function loadPortalProfessorsList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const [professors, documentDownloadUrls] = await Promise.all([
    listAcademyProfessors(academy.id, {
      selectedEventId: eventContext.activeEvent?.id ?? null,
    }),
    // Offered to any authenticated academy user, with no further gate: these
    // are blank forms an academy needs *before* registering, so gating them
    // behind a registration would invert the real order of operations.
    loadEventDocumentDownloadUrls({
      eventId: eventContext.activeEvent?.id ?? null,
      storage: createDefaultEventDocumentStorage(),
    }),
  ]);

  return {
    documentDownloadUrls,
    professors,
  };
}

export async function handlePortalProfessorsListAction(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== createProfessorIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  return await handleCreateProfessorAction({ academyId: academy.id, formData });
}

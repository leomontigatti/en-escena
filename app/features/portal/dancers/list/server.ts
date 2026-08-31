import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { loadEventDocumentDownloadUrls } from "@/lib/events/event-documents.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { createDefaultEventDocumentStorage } from "@/lib/storage/event-documents.server";
import { handleCreateDancerAction } from "@/features/portal/dancers/create/server";
import { createDancerIntent } from "@/features/portal/dancers/create/shared";

export async function loadPortalDancersList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const [dancers, documentDownloadUrls] = await Promise.all([
    listDancersForAcademy(academy.id, {
      selectedEventId: eventContext.activeEvent?.id ?? null,
      status: "all",
    }),
    // The minor authorization is always offered, never conditioned on whether
    // the academy already has minors: an academy about to enroll its first
    // minor must be able to find the form.
    loadEventDocumentDownloadUrls({
      eventId: eventContext.activeEvent?.id ?? null,
      storage: createDefaultEventDocumentStorage(),
    }),
  ]);

  return {
    dancers,
    documentDownloadUrls,
  };
}

export async function handlePortalDancersListAction(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== createDancerIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  return await handleCreateDancerAction({ academyId: academy.id, formData });
}

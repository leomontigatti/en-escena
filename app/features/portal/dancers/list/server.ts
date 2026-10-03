import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { loadPortalEventDocumentDownloadUrls } from "@/lib/events/event-documents.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";

export async function loadPortalDancersList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const [dancers, documentDownloadUrls] = await Promise.all([
    listDancersForAcademy(academy.id, {
      selectedEventId: eventContext.activeEvent?.id ?? null,
    }),
    // The minor authorization is always offered, never conditioned on whether
    // the academy already has minors: an academy about to enroll its first
    // minor must be able to find the form.
    loadPortalEventDocumentDownloadUrls(eventContext.activeEvent?.id ?? null),
  ]);

  return {
    dancers,
    documentDownloadUrls,
  };
}

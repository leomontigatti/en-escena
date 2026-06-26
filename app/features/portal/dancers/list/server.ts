import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { handleCreateDancerAction } from "@/features/portal/dancers/create/server";
import { createDancerIntent } from "@/features/portal/dancers/create/shared";

export async function loadPortalDancersList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const dancers = await listDancersForAcademy(academy.id, {
    selectedEventId: eventContext.activeEvent?.id ?? null,
    status: "all",
  });

  return {
    dancers,
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

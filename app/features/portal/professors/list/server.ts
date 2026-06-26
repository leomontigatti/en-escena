import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";
import { handleCreateProfessorAction } from "@/features/portal/professors/create/server";
import { createProfessorIntent } from "@/features/portal/professors/create/shared";

export async function loadPortalProfessorsList(request: Request) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventSummaryContext(request);
  const professors = await listAcademyProfessors(academy.id, {
    selectedEventId: eventContext.activeEvent?.id ?? null,
  });

  return {
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

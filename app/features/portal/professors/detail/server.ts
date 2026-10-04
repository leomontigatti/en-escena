import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import {
  findAcademyProfessor,
  updateAcademyProfessor,
  type UpdateProfessorInput,
} from "@/lib/portal/professors.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import { hasActiveEventParticipation } from "@/lib/roster/active-event-participation.server";
import {
  findProfessorChoreographies,
  findRosterSeminarInscriptions,
} from "@/lib/roster/inscriptions.server";
import {
  getRosterPersonNotFoundMessage,
  setRosterPersonStatus,
} from "@/lib/roster/roster-person-status.server";
import {
  archiveProfessorIntent,
  portalProfessorNotFoundMessage,
  reactivateProfessorIntent,
  updateProfessorIntent,
  type PortalProfessorDetailLoaderData,
} from "@/features/portal/professors/detail/shared";

export async function loadPortalProfessorDetail({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);
  const professor = await requireProfessor(academy.id, professorId);
  const eventContext = await getPortalActiveEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const [choreographies, seminarInscriptions] = await Promise.all([
    findProfessorChoreographies({ professorId, selectedEventId }),
    findRosterSeminarInscriptions({
      person: { id: professorId, kind: "professor" },
      selectedEventId,
    }),
  ]);

  return {
    choreographies,
    isParticipatingInActiveEvent: await hasActiveEventParticipation({
      kind: "professor",
      personId: professorId,
    }),
    professor,
    selectedEventId,
    seminarInscriptions,
  } satisfies PortalProfessorDetailLoaderData;
}

export async function handlePortalProfessorDetailAction({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === archiveProfessorIntent) {
    const result = await setRosterPersonStatus({
      academyId: academy.id,
      kind: "professor",
      next: "archived",
      personId: professorId,
      surface: "portal",
    });

    if (!result.ok) {
      // Two causes, two channels — see the dancer twin.
      if (result.cause === "participating") {
        return {
          status: "error" as const,
          message: result.message,
          fieldErrors: {},
        };
      }

      throw new Response(getRosterPersonNotFoundMessage("professor"), {
        status: 404,
      });
    }
    return {
      status: "success" as const,
      message: notificationToasts["profesor-archivado"].message,
    };
  }

  if (intent === reactivateProfessorIntent) {
    const result = await setRosterPersonStatus({
      academyId: academy.id,
      kind: "professor",
      next: "active",
      personId: professorId,
      surface: "portal",
    });

    if (!result.ok) {
      throw new Response(getRosterPersonNotFoundMessage("professor"), {
        status: 404,
      });
    }
    return {
      status: "success" as const,
      message: notificationToasts["profesor-reactivado"].message,
    };
  }

  if (intent !== "" && intent !== updateProfessorIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
  };
  const result = await updateAcademyProfessor(academy.id, professorId, values, {
    acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
  });

  if (!result.ok && "warning" in result) {
    return {
      status: "warning" as const,
      warning: result.warning,
      values,
    };
  }

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
      duplicateDocumentProfessorId: result.duplicateDocumentProfessorId,
    };
  }

  return {
    status: "success" as const,
    message: notificationToasts["profesor-guardado"].message,
  };
}

function readProfessorId(params: { professorId?: string }) {
  if (!params.professorId) {
    throw new Response(portalProfessorNotFoundMessage, { status: 404 });
  }

  return params.professorId;
}

async function requireProfessor(academyId: string, professorId: string) {
  const professor = await findAcademyProfessor(academyId, professorId);

  if (!professor) {
    throw new Response(portalProfessorNotFoundMessage, { status: 404 });
  }

  return professor;
}

function readFormString(
  formData: FormData,
  key: keyof UpdateProfessorInput | "intent",
) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

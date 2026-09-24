import { getFieldErrors } from "@/lib/shared/form-validation";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { professorNotFoundMessage } from "@/lib/admin/professors/professors.shared";
import {
  findProfessor,
  updateAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import { hasActiveEventParticipation } from "@/lib/roster/active-event-participation.server";
import {
  getRosterPersonNotFoundMessage,
  setRosterPersonStatus,
} from "@/lib/roster/roster-person-status.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";

import {
  buildBackToListHref,
  buildModeHref,
  buildProfessorActionError,
  buildProfessorActionSuccess,
  buildProfessorEditSchema,
  professorFieldNames,
  readProfessorUpdateValues,
} from "./shared";

export async function loadProfessorDetail(input: {
  request: Request;
  params: { professorId?: string };
}) {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = readProfessorId(input.params);
  const professor = await findProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  const url = new URL(input.request.url);

  return {
    canEdit: user.role === "admin",
    selectedEventId: eventContext.selectedEventId,
    professor,
    backToList: buildBackToListHref(input.request.url),
    editHref: buildModeHref(url, "editar"),
    cancelHref: buildModeHref(url, null),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
    isParticipatingInActiveEvent: await hasActiveEventParticipation({
      kind: "professor",
      personId: professorId,
    }),
  };
}

export async function handleProfessorDetailAction(input: {
  request: Request;
  params: { professorId?: string };
}) {
  await requireAdminUser(input.request);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = readProfessorId(input.params);
  const formData = await input.request.formData();
  const intent = formData.get("intent");
  const professor = await findProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-professor" || intent === "reactivate-professor") {
    const result = await setRosterPersonStatus({
      academyId: null,
      kind: "professor",
      next: intent === "archive-professor" ? "archived" : "active",
      personId: professorId,
      surface: "admin",
    });

    if (!result.ok) {
      // Two causes, two channels — see the dancer twin.
      if (result.cause === "participating") {
        return buildProfessorActionError(result.message, {});
      }

      throw new Response(getRosterPersonNotFoundMessage("professor"), {
        status: 404,
      });
    }

    return buildProfessorActionSuccess(
      intent === "archive-professor"
        ? "profesor-archivado"
        : "profesor-reactivado",
    );
  }

  return await saveAdministrativeProfessor({
    formData,
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });
}

/**
 * The edit itself, apart from the status intents.
 */
async function saveAdministrativeProfessor({
  formData,
  professorId,
  selectedEventId,
}: {
  formData: FormData;
  professorId: string;
  selectedEventId: string | null;
}) {
  const values = readProfessorUpdateValues(formData);
  const parsed = buildProfessorEditSchema().safeParse(values);

  if (!parsed.success) {
    return buildProfessorActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, professorFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeProfessor({
    acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
    professorId,
    selectedEventId: selectedEventId,
    values: parsed.data,
  });

  if (!result.ok && "warning" in result) {
    return {
      status: "warning" as const,
      warning: result.warning,
      values: parsed.data,
    };
  }

  if (!result.ok) {
    return buildProfessorActionError(
      result.message,
      result.fieldErrors,
      result.values,
      result.duplicateDocumentProfessorId,
    );
  }

  return buildProfessorActionSuccess("profesor-guardado");
}

function readProfessorId(params: { professorId?: string }) {
  if (!params.professorId) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return params.professorId;
}

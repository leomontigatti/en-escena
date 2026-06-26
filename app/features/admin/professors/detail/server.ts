import { getFieldErrors } from "@/lib/shared/form-validation";
import { redirect } from "react-router";

import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { adminProfessorNotFoundMessage } from "@/lib/admin/professors/professors.shared";
import {
  findAdministrativeProfessor,
  setAdministrativeProfessorActiveState,
  updateAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";

import {
  buildBackToListHref,
  buildDetailNotificationHref,
  buildModeHref,
  buildProfessorActionError,
  buildProfessorReasonSchema,
  buildProfessorUpdateSchema,
  professorFieldNames,
  readProfessorReasonValues,
  readProfessorUpdateValues,
} from "./shared";

export async function loadAdministrativeProfessorDetail(input: {
  request: Request;
  params: { professorId?: string };
}) {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = readProfessorId(input.params);
  const professor = await findAdministrativeProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
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
  };
}

export async function handleAdministrativeProfessorDetailAction(input: {
  request: Request;
  params: { professorId?: string };
}) {
  const adminUser = await requireAdminUser(input.request);
  const eventContext = await loadAdminEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = readProfessorId(input.params);
  const formData = await input.request.formData();
  const intent = formData.get("intent");
  const professor = await findAdministrativeProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-professor" || intent === "reactivate-professor") {
    const values = readProfessorReasonValues(formData);
    const parsed = buildProfessorReasonSchema(
      professor.correctionReasonRequired,
    ).safeParse(values);

    if (!parsed.success) {
      return buildProfessorActionError(
        "Revisá los campos marcados.",
        getFieldErrors(parsed.error, professorFieldNames),
        values,
      );
    }

    const result = await setAdministrativeProfessorActiveState({
      action: intent === "archive-professor" ? "archive" : "reactivate",
      adminUserId: adminUser.id,
      professorId,
      selectedEventId: eventContext.selectedEventId,
      correctionReason: parsed.data.correctionReason,
    });

    if (!result.ok) {
      return buildProfessorActionError(
        result.message,
        result.fieldErrors,
        values,
      );
    }

    const notification =
      intent === "archive-professor"
        ? "profesor-archivado"
        : "profesor-reactivado";

    throw redirect(
      buildDetailNotificationHref(input.request.url, professorId, notification),
    );
  }

  const values = readProfessorUpdateValues(formData);
  const parsed = buildProfessorUpdateSchema(
    professor.correctionReasonRequired,
  ).safeParse(values);

  if (!parsed.success) {
    return buildProfessorActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, professorFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeProfessor({
    adminUserId: adminUser.id,
    professorId,
    selectedEventId: eventContext.selectedEventId,
    values: parsed.data,
  });

  if (!result.ok) {
    return buildProfessorActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  throw redirect(
    buildDetailNotificationHref(
      input.request.url,
      professorId,
      "profesor-guardado",
    ),
  );
}

function readProfessorId(params: { professorId?: string }) {
  if (!params.professorId) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  return params.professorId;
}

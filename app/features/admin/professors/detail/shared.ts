import { z } from "zod";
import {
  rosterDocumentPairFields,
  rosterPersonNameFields,
} from "@/lib/roster/roster-identity-fields";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";

import type {
  ProfessorFieldErrors,
  ProfessorUpdateInput,
  findProfessor,
} from "@/lib/admin/professors/professors.server";
import {
  getArchiveKeepsRosterMessage,
  getRosterPersonArchiveAvailability,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";

export const professorFieldNames = [
  "firstName",
  "lastName",
  "documentType",
  "documentNumber",
] as const satisfies ReadonlyArray<keyof ProfessorFieldErrors>;

export type ProfessorDetailLoaderData = {
  backToList: string;
  cancelHref: string;
  canEdit: boolean;
  editHref: string;
  isEditing: boolean;
  /**
   * Answered by `hasActiveEventParticipation`, the same reader the guard in
   * `setRosterPersonStatus` asks — see the dancer twin.
   */
  isParticipatingInActiveEvent: boolean;
  professor: NonNullable<Awaited<ReturnType<typeof findProfessor>>>;
  selectedEventId: string | null;
};

export type ProfessorEditFormValues = ProfessorUpdateInput;

/**
 * `values` is absent when the failure was not a rejected edit: a refused
 * archive has no form to repopulate. See the dancer twin.
 */
export type ProfessorActionError = {
  status: "error";
  message: string;
  fieldErrors: ProfessorFieldErrors;
  values?: ProfessorUpdateInput;
  // The professor already holding the document number, so the form can link
  // to them when the match is an archived one.
  duplicateDocumentProfessorId?: string;
};

export type ProfessorActionSuccess = {
  status: "success";
  message: string;
};

export type ProfessorDetailActionData =
  ProfessorActionError | ProfessorActionSuccess;

export type ProfessorRouteNotification = Extract<
  NotificationKey,
  "profesor-archivado" | "profesor-guardado" | "profesor-reactivado"
>;

export type ProfessorDialogIntent =
  "archive-professor" | "reactivate-professor" | "update-professor";

export type ProfessorStatusAction = {
  /**
   * A courtesy in front of the guard, never the rule: the server refuses the
   * archive whether or not this is honoured. Reactivating is never refused, so
   * only the archive intent is ever disabled.
   */
  disabled: boolean;
  intent: Exclude<ProfessorDialogIntent, "update-professor">;
  label: string;
};

export type ProfessorDetailViewState = {
  /**
   * Why the archive action is unavailable, or `null` when it is available.
   * Informational: nothing is wrong when it shows.
   */
  participatingAlert: string | null;
  statusAction: ProfessorStatusAction;
};

/**
 * The status half of the screen's view model: which action the header offers,
 * whether it is available, and the sentence that explains an unavailable one.
 * The dancer twin is `buildDancerDetailViewState`.
 */
export function buildProfessorDetailViewState({
  active,
  isParticipatingInActiveEvent,
}: {
  active: boolean;
  isParticipatingInActiveEvent: boolean;
}): ProfessorDetailViewState {
  const archiveAvailability = getRosterPersonArchiveAvailability({
    isParticipatingInActiveEvent,
    kind: "professor",
    status: toRosterPersonStatus(active),
  });
  const statusAction: ProfessorStatusAction = active
    ? {
        disabled: archiveAvailability.disabled,
        intent: "archive-professor",
        label: "Archivar",
      }
    : {
        disabled: false,
        intent: "reactivate-professor",
        label: "Reactivar",
      };

  return {
    participatingAlert: archiveAvailability.participatingAlert,
    statusAction,
  };
}

export type ProfessorConfirmationAction = {
  confirmLabel: string;
  confirmTitle: string;
  description: string;
  intent: ProfessorDialogIntent;
  variant: "default" | "destructive";
};

export function getProfessorConfirmationAction({
  active,
  intent,
}: {
  active: boolean;
  intent: ProfessorDialogIntent | null;
}): ProfessorConfirmationAction {
  if (intent === "update-professor") {
    return {
      confirmLabel: "Guardar",
      confirmTitle: "¿Guardar cambios?",
      description:
        "Este profesor ya participó de un evento. Los cambios pueden afectar registros existentes.",
      intent: "update-professor",
      variant: "default",
    };
  }

  if (active) {
    return {
      confirmLabel: "Archivar",
      confirmTitle: "¿Archivar profesor?",
      description: `El profesor dejará de aparecer en las vistas activas y en próximas selecciones del portal. ${getArchiveKeepsRosterMessage("professor")}`,
      intent: "archive-professor",
      variant: "destructive",
    };
  }

  return {
    confirmLabel: "Reactivar",
    confirmTitle: "¿Reactivar profesor?",
    description:
      "El profesor volverá a aparecer en las vistas activas y en próximas selecciones del portal.",
    intent: "reactivate-professor",
    variant: "default",
  };
}

export function buildProfessorEditSchema() {
  return z
    .object({ ...rosterPersonNameFields, ...rosterDocumentPairFields })
    .superRefine((values, context) => {
      validateDocumentPair(values.documentType, values.documentNumber, context);
    });
}

export function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
}

export function buildModeHref(url: URL, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("evento");

  if (mode === null) {
    searchParams.delete("modo");
  } else {
    searchParams.set("modo", mode);
  }

  const search = searchParams.toString();

  return `/administracion/profesores/${readProfessorIdFromPath(url.pathname)}${
    search.length > 0 ? `?${search}` : ""
  }`;
}

// In-place editing on the detail does not redirect: it returns
// `{ status: "success", message }`, the loader revalidates and the view fires the
// toast directly from `actionData`. See docs/agents/form-feedback.md.
export function buildProfessorActionSuccess(
  notification: ProfessorRouteNotification,
): ProfessorActionSuccess {
  return {
    status: "success",
    message: notificationToasts[notification].message,
  };
}

export function readProfessorUpdateValues(
  formData: FormData,
): ProfessorUpdateInput {
  return {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
  };
}

export function buildProfessorActionError(
  message: string,
  fieldErrors: ProfessorActionError["fieldErrors"],
  values?: ProfessorActionError["values"],
  duplicateDocumentProfessorId?: string,
): ProfessorActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
    duplicateDocumentProfessorId,
  };
}

/**
 * The document refusal the panel professor action can answer with, read for
 * the field it belongs to.
 */
export function getProfessorDocumentConflict(
  actionData?: ProfessorActionError,
): RosterDocumentConflict {
  if (!actionData) {
    return {};
  }

  const matchId = actionData.duplicateDocumentProfessorId;

  return {
    matchHref: matchId ? `/administracion/profesores/${matchId}` : undefined,
    matchLabel: "Ver la ficha del profesor con ese documento",
    message: actionData.fieldErrors.documentNumber,
  };
}

/**
 * Whether a failure carried the submitted edit — see the dancer twin. Only a
 * rejected `Guardar` builds `values`, so its presence is what tells an edit to
 * repopulate from a refused status change with no form behind it.
 */
function isProfessorUpdateValues(
  values: ProfessorActionError["values"] | undefined,
): values is ProfessorUpdateInput {
  return values !== undefined;
}

export function getSubmittedProfessorUpdateValues(
  actionData: ProfessorActionError | undefined,
): ProfessorUpdateInput | null {
  return isProfessorUpdateValues(actionData?.values) ? actionData.values : null;
}

export function toProfessorEditValues(
  values: ProfessorUpdateInput,
): ProfessorEditFormValues {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    documentType: values.documentType,
    documentNumber: values.documentNumber,
  };
}

export function getProfessorEditValues(input: {
  actionData?: ProfessorActionError;
  professor: ProfessorDetailLoaderData["professor"];
}): ProfessorEditFormValues {
  const submittedValues = getSubmittedProfessorUpdateValues(input.actionData);

  if (submittedValues) {
    return toProfessorEditValues(submittedValues);
  }

  return {
    firstName: input.professor.firstName,
    lastName: input.professor.lastName,
    documentType: input.professor.documentType ?? "",
    documentNumber: input.professor.documentNumber ?? "",
  };
}

export function getInitialDialogIntent(
  actionData: ProfessorActionError | undefined,
  shouldConfirmSave: boolean,
): ProfessorDialogIntent | null {
  if (!actionData) {
    return null;
  }

  if (shouldConfirmSave && isProfessorUpdateValues(actionData.values)) {
    return "update-professor";
  }

  return null;
}

export function getProfessorDialogFormId(intent: ProfessorDialogIntent | null) {
  switch (intent) {
    case "archive-professor":
      return "administracion-profesor-archive-form";
    case "reactivate-professor":
      return "administracion-profesor-reactivate-form";
    case "update-professor":
      return "administracion-profesor-update-form";
    case null:
      return "administracion-profesor-dialog-form";
  }
}

function validateDocumentPair(
  documentType: string,
  documentNumber: string,
  context: z.RefinementCtx,
) {
  const hasDocumentType = documentType.length > 0;
  const hasDocumentNumber = documentNumber.length > 0;

  if (!hasDocumentType && !hasDocumentNumber) {
    return;
  }

  if (!hasDocumentType) {
    context.addIssue({
      code: "custom",
      path: ["documentType"],
      message: "Seleccioná el tipo de documento.",
    });
  }

  if (!hasDocumentNumber) {
    context.addIssue({
      code: "custom",
      path: ["documentNumber"],
      message: "Ingresá el número de documento.",
    });
  }
}

function readProfessorIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  return segments.at(-1) ?? "";
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

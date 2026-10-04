import { Check, type LucideIcon } from "lucide-react";
import { z } from "zod";
import type {
  RosterChoreography,
  RosterSeminarInscription,
} from "@/lib/roster/inscriptions";
import type { RosterNameWarningActionData } from "@/lib/roster/roster-name-duplicates";
import type {
  RosterMergeCandidate,
  RosterMergeEventInscriptions,
} from "@/lib/roster/roster-merge.shared";
import type { MergeRefusedActionData } from "@/lib/shared/merge";
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
  isRosterPersonArchiveBlocked,
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
  canEdit: boolean;
  /**
   * Answered by `hasActiveEventParticipation`, the same reader the guard in
   * `setRosterPersonStatus` asks — see the dancer twin.
   */
  isParticipatingInActiveEvent: boolean;
  /** What the merge dialog offers; `null` for a read-only auditor. */
  merge: {
    candidates: RosterMergeCandidate[];
    inscriptionsByEvent: RosterMergeEventInscriptions[];
  } | null;
  professor: NonNullable<Awaited<ReturnType<typeof findProfessor>>>;
  choreographies: RosterChoreography[];
  seminarInscriptions: RosterSeminarInscription[];
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
  | ProfessorActionError
  | ProfessorActionSuccess
  | MergeRefusedActionData
  | RosterNameWarningActionData<ProfessorEditFormValues>;

export type ProfessorRouteNotification = Extract<
  NotificationKey,
  "profesor-archivado" | "profesor-guardado" | "profesor-reactivado"
>;

export type ProfessorDialogIntent =
  "archive-professor" | "reactivate-professor" | "update-professor";

export type ProfessorStatusAction = {
  intent: Exclude<ProfessorDialogIntent, "update-professor">;
  /**
   * Whether the action opens `RosterPersonArchiveBlockedDialog` instead of its
   * confirmation. Reactivating is never refused, so only the archive intent is
   * ever blocked.
   */
  isBlocked: boolean;
  label: string;
};

export type ProfessorDetailViewState = {
  statusAction: ProfessorStatusAction;
};

/**
 * The status half of the screen's view model: which action the header offers,
 * and whether it is blocked.
 * The dancer twin is `buildDancerDetailViewState`.
 */
export function buildProfessorDetailViewState({
  active,
  isParticipatingInActiveEvent,
}: {
  active: boolean;
  isParticipatingInActiveEvent: boolean;
}): ProfessorDetailViewState {
  const statusAction: ProfessorStatusAction = active
    ? {
        isBlocked: isRosterPersonArchiveBlocked({
          isParticipatingInActiveEvent,
          status: toRosterPersonStatus(active),
        }),
        intent: "archive-professor",
        label: "Archivar",
      }
    : {
        isBlocked: false,
        intent: "reactivate-professor",
        label: "Reactivar",
      };

  return {
    statusAction,
  };
}

/** What the confirmation dialog asks, in the shape `ConfirmationDialog` takes. */
export type ProfessorConfirmationAction = {
  confirmIcon?: LucideIcon;
  confirmLabel: string;
  description: string;
  destructive: boolean;
  intent: ProfessorDialogIntent;
  title: string;
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
      confirmIcon: Check,
      confirmLabel: "Guardar",
      description:
        "Este profesor ya participó de un evento. Los cambios pueden afectar registros existentes.",
      destructive: false,
      intent: "update-professor",
      title: "¿Guardar los cambios?",
    };
  }

  if (active) {
    return {
      confirmLabel: "Archivar",
      description: `El profesor dejará de aparecer en las vistas activas y en próximas selecciones del portal. ${getArchiveKeepsRosterMessage("professor")}`,
      destructive: true,
      intent: "archive-professor",
      title: "¿Archivar al profesor?",
    };
  }

  return {
    confirmLabel: "Reactivar",
    description:
      "El profesor volverá a aparecer en las vistas activas y en próximas selecciones del portal.",
    destructive: false,
    intent: "reactivate-professor",
    title: "¿Reactivar al profesor?",
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

  searchParams.delete("evento");
  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
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

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

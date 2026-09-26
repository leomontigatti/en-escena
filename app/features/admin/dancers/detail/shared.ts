import { z } from "zod";
import type { RosterNameWarningActionData } from "@/lib/roster/roster-name-duplicates";
import type {
  MergeRefusedActionData,
  RosterMergeCandidate,
  RosterMergeEventInscriptions,
} from "@/lib/roster/roster-merge.shared";
import {
  buildDancerBirthDateField,
  rosterDocumentImageFields,
  rosterDocumentPairFields,
  rosterPersonNameFields,
} from "@/lib/roster/roster-identity-fields";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";

import type {
  DancerFieldErrors,
  DancerUpdateInput,
  DancerEditConsequence,
  findDancer,
} from "@/lib/admin/dancers/dancers.server";
import {
  withDancerBirthDateScheduleMoveFeedback,
  type DancerBirthDateScheduleMove,
} from "@/lib/choreographies/dancer-birthdate-messages";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
import {
  getArchiveKeepsRosterMessage,
  getRosterPersonArchiveAvailability,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";
import type { UnexpectedActionError } from "@/lib/shared/recoverable-client-action";

export type { DancerEditConsequence };

export const dancerFieldNames = [
  "firstName",
  "lastName",
  "birthDate",
  "documentType",
  "documentNumber",
  "documentFrontImageStorageKey",
  "documentBackImageStorageKey",
] as const satisfies ReadonlyArray<keyof DancerFieldErrors>;

export type DancerDetailLoaderData = {
  activeEventStartDate: string | null;
  backToList: string;
  cancelHref: string;
  canEdit: boolean;
  dancer: NonNullable<Awaited<ReturnType<typeof findDancer>>>;
  documentImageUrls: {
    back: string | null;
    front: string | null;
  };
  editHref: string;
  isEditing: boolean;
  /**
   * Answered by `hasActiveEventParticipation`, the same reader the guard in
   * `setRosterPersonStatus` asks. One reader for both, so the screen cannot
   * grey out a button the server would honour — or offer one it would refuse.
   */
  isParticipatingInActiveEvent: boolean;
  /** What the merge dialog offers; `null` for a read-only auditor. */
  merge: {
    candidates: RosterMergeCandidate[];
    inscriptionsByEvent: RosterMergeEventInscriptions[];
  } | null;
  selectedEventId: string | null;
};

/**
 * `values` is absent when the failure was not a rejected edit: a refused
 * archive has no form to repopulate, and its presence is what tells
 * `getInitialDialogIntent` there is a save confirmation to re-open.
 */
export type DancerActionError = {
  status: "error";
  message: string;
  fieldErrors: DancerFieldErrors;
  values?: DancerUpdateInput;
  // The dancer already holding the document number, so the form can link to
  // them when the match is an archived one.
  duplicateDocumentDancerId?: string;
};

export type DancerDialogIntent =
  "archive-dancer" | "reactivate-dancer" | "save" | "verify";

export type DancerActionSuccess = {
  status: "success";
  message: string;
  recategorisedChoreographies: RecategorisedChoreography[];
};

export type DancerDetailActionData =
  | DancerActionError
  | DancerActionSuccess
  | MergeRefusedActionData
  | RosterNameWarningActionData<DancerEditFormValues>;

export type DancerRouteNotification = Extract<
  NotificationKey,
  | "bailarin-archivado"
  | "bailarin-guardado"
  | "bailarin-guardado-requiere-verificacion"
  | "bailarin-reactivado"
  | "bailarin-verificado"
>;

export type DancerStatusAction = {
  /**
   * A courtesy in front of the guard, never the rule: the server refuses the
   * archive whether or not this is honoured. Reactivating is never refused, so
   * only the archive intent is ever disabled.
   */
  disabled: boolean;
  description: string;
  intent: "archive-dancer" | "reactivate-dancer";
  label: string;
};

export type DancerDetailViewState = {
  birthDateMayNeedRecalculation: boolean;
  canVerifyIdentity: boolean;
  editConsequence: DancerEditConsequence;
  identificationAlert: string | null;
  identificationAlertVariant: "info" | "warning";
  isEditing: boolean;
  /**
   * Why the archive action is unavailable, or `null` when it is available.
   * Informational: nothing is wrong when it shows.
   */
  participatingAlert: string | null;
  shouldConfirmSave: boolean;
  statusAction: DancerStatusAction;
};

export type DancerEditFormValues = DancerUpdateInput;

export function buildDancerUpdateSchema(eventStartDate: string | null) {
  return z
    .object({
      ...rosterPersonNameFields,
      birthDate: buildDancerBirthDateField(eventStartDate),
      ...rosterDocumentPairFields,
      ...rosterDocumentImageFields,
    })
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

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

export function buildModeHref(
  url: URL,
  dancerId: string,
  mode: "editar" | null,
) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("evento");

  if (mode === null) {
    searchParams.delete("modo");
  } else {
    searchParams.set("modo", mode);
  }

  const search = searchParams.toString();

  return `/administracion/bailarines/${dancerId}${
    search.length > 0 ? `?${search}` : ""
  }`;
}

// In-place editing on the detail does not redirect: it returns
// `{ status: "success", message }`, the loader revalidates and the view fires the
// toast directly from `actionData`. See docs/agents/form-feedback.md.
export function buildDancerActionSuccess(
  notification: DancerRouteNotification,
  // Explicit at every call site: an intent that forgets it would silently
  // report no recategorisation rather than the one it just caused.
  recategorisedChoreographies: RecategorisedChoreography[],
  scheduleMoves: DancerBirthDateScheduleMove[] = [],
): DancerActionSuccess {
  return {
    status: "success",
    message: withDancerBirthDateScheduleMoveFeedback(
      notificationToasts[notification].message,
      scheduleMoves,
    ),
    recategorisedChoreographies,
  };
}

export function readDancerUpdateValues(formData: FormData): DancerUpdateInput {
  return {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    birthDate: readFormString(formData, "birthDate"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
    documentFrontImageStorageKey: readFormString(
      formData,
      "documentFrontImageStorageKey",
    ),
    documentBackImageStorageKey: readFormString(
      formData,
      "documentBackImageStorageKey",
    ),
  };
}

export function buildDancerActionError(
  message: string,
  fieldErrors: DancerActionError["fieldErrors"],
  values?: DancerActionError["values"],
  duplicateDocumentDancerId?: string,
): DancerActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
    duplicateDocumentDancerId,
  };
}

/**
 * The document refusal the panel dancer action can answer with, read for the
 * field it belongs to.
 */
export function getDancerDocumentConflict(
  actionData?: DancerActionError,
): RosterDocumentConflict {
  if (!actionData) {
    return {};
  }

  const matchId = actionData.duplicateDocumentDancerId;

  return {
    matchHref: matchId ? `/administracion/bailarines/${matchId}` : undefined,
    matchLabel: "Ver la ficha del bailarín con ese documento",
    message: actionData.fieldErrors.documentNumber,
  };
}

/**
 * Whether a failure carried the submitted edit. Only a rejected `Guardar`
 * builds `values`, so its presence is the discriminant between the two
 * failures this feature returns: an edit to repopulate, or a refused status
 * change with no form behind it.
 */
function isDancerUpdateValues(
  values: DancerActionError["values"] | undefined,
): values is DancerUpdateInput {
  return values !== undefined;
}

export function getSubmittedDancerUpdateValues(
  actionData: DancerActionError | undefined,
): DancerUpdateInput | null {
  return isDancerUpdateValues(actionData?.values) ? actionData.values : null;
}

export function getDancerEditValues({
  actionData,
  dancer,
}: {
  actionData: DancerActionError | undefined;
  dancer: DancerDetailLoaderData["dancer"];
}): DancerEditFormValues {
  const submittedValues = getSubmittedDancerUpdateValues(actionData);

  return {
    firstName: submittedValues?.firstName ?? dancer.firstName,
    lastName: submittedValues?.lastName ?? dancer.lastName,
    birthDate: submittedValues?.birthDate ?? dancer.birthDate,
    documentType: submittedValues?.documentType ?? dancer.documentType ?? "",
    documentNumber:
      submittedValues?.documentNumber ?? dancer.documentNumber ?? "",
    documentFrontImageStorageKey:
      submittedValues?.documentFrontImageStorageKey ??
      dancer.documentFrontImageStorageKey ??
      "",
    documentBackImageStorageKey:
      submittedValues?.documentBackImageStorageKey ??
      dancer.documentBackImageStorageKey ??
      "",
  };
}

function getDancerStatusAction({
  active,
  isArchiveDisabled,
}: {
  active: boolean;
  isArchiveDisabled: boolean;
}): DancerStatusAction {
  return active
    ? {
        disabled: isArchiveDisabled,
        description: `Archivá este Bailarín para que deje de aparecer en futuras selecciones del portal. ${getArchiveKeepsRosterMessage("dancer")}`,
        intent: "archive-dancer",
        label: "Archivar",
      }
    : {
        disabled: false,
        description:
          "Reactivá este Bailarín para que vuelva a aparecer en futuras selecciones del portal.",
        intent: "reactivate-dancer",
        label: "Reactivar Bailarín",
      };
}

export function getInitialDialogIntent({
  actionData,
  shouldConfirmSave,
}: {
  actionData: DancerActionError | UnexpectedActionError | undefined;
  shouldConfirmSave: boolean;
}): DancerDialogIntent | null {
  if (!actionData) {
    return null;
  }

  const submittedValues =
    "values" in actionData ? actionData.values : undefined;

  // Only a rejected `Guardar` carries `values`, and only an edit whose save
  // needs confirming has a dialog to go back to. Everything else re-opens
  // nothing: a refused status change is reported by its toast, and by the
  // time it lands the page has reloaded with `Archivar` already disabled and
  // the participation alert showing, so a re-opened dialog would offer only a
  // confirm the server refuses again. The generic error from
  // `recoverableClientAction` carries no `values` either and is left alone for
  // the same reason.
  return shouldConfirmSave && isDancerUpdateValues(submittedValues)
    ? "save"
    : null;
}

function hasDancerVerificationMinimumData(
  dancer: DancerDetailLoaderData["dancer"],
) {
  return Boolean(
    dancer.birthDate &&
    dancer.documentType &&
    dancer.documentNumber &&
    dancer.documentFrontImageStorageKey &&
    dancer.documentBackImageStorageKey,
  );
}

export function buildDancerDetailViewState({
  actionData,
  canEdit,
  dancer,
  isParticipatingInActiveEvent,
  requestedEditMode,
  watchedBirthDate,
}: {
  actionData: DancerActionError | undefined;
  canEdit: boolean;
  dancer: DancerDetailLoaderData["dancer"];
  isParticipatingInActiveEvent: boolean;
  requestedEditMode: boolean;
  watchedBirthDate: string;
}): DancerDetailViewState {
  // A failure only re-opens the edit form when it was an edit that failed: a
  // refused archive carries no submitted values and must leave the screen in
  // read mode, with the dialog and the toast doing the reporting.
  const isEditing =
    canEdit && (requestedEditMode || isDancerUpdateValues(actionData?.values));
  const archiveAvailability = getRosterPersonArchiveAvailability({
    isParticipatingInActiveEvent,
    kind: "dancer",
    status: toRosterPersonStatus(dancer.active),
  });
  const statusAction = getDancerStatusAction({
    active: dancer.active,
    isArchiveDisabled: archiveAvailability.disabled,
  });
  const canVerifyIdentity =
    canEdit &&
    hasDancerVerificationMinimumData(dancer) &&
    dancer.identificationStatus !== "verified";
  const identificationAlert = getIdentificationAlert(
    dancer.identificationStatus,
  );
  const identificationAlertVariant =
    dancer.identificationStatus === "unverified" ? "info" : "warning";
  const birthDateMayNeedRecalculation =
    isEditing &&
    dancer.participatedInAnyEvent &&
    watchedBirthDate !== dancer.birthDate;

  return {
    birthDateMayNeedRecalculation,
    canVerifyIdentity,
    editConsequence: dancer.editConsequence,
    identificationAlert,
    identificationAlertVariant,
    isEditing,
    participatingAlert: archiveAvailability.participatingAlert,
    shouldConfirmSave:
      dancer.editConsequence !== null || birthDateMayNeedRecalculation,
    statusAction,
  };
}

export function getSaveConsequenceMessage(
  editConsequence: DancerEditConsequence,
): string | null {
  switch (editConsequence) {
    case "verified":
      return "Este bailarín tiene su identidad verificada. Si guardás los cambios, la verificación quedará sin efecto y deberá volver a verificarse.";
    case "participated":
      return "Este bailarín ya participó de un evento. Los cambios pueden afectar registros existentes.";
    case "both":
      return "Este bailarín tiene su identidad verificada y ya participó de un evento. Al guardar, la verificación quedará sin efecto y los cambios pueden afectar registros existentes.";
    case null:
      return null;
  }
}

function getIdentificationAlert(
  identificationStatus: DancerDetailLoaderData["dancer"]["identificationStatus"],
) {
  switch (identificationStatus) {
    case "incomplete":
      return "Faltan datos o imágenes del documento para completar la verificación.";
    case "unverified":
      return "La documentación está lista para verificar la identidad del bailarín.";
    case "verified":
      return "La identidad fue verificada. Si corregís datos o imágenes, este bailarín volverá a no verificado.";
  }
}

function validateDocumentPair(
  documentType: string,
  documentNumber: string,
  context: z.RefinementCtx,
) {
  if (!documentType && !documentNumber) {
    return;
  }

  if (!documentType) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná el tipo de documento.",
      path: ["documentType"],
    });
  }

  if (!documentNumber) {
    context.addIssue({
      code: "custom",
      message: "Ingresá el número de documento.",
      path: ["documentNumber"],
    });
  }

  if (!documentType || !documentNumber) {
    return;
  }

  if (!isDocumentType(documentType)) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná un tipo de documento válido.",
      path: ["documentType"],
    });

    return;
  }

  if (documentType !== "dni") {
    return;
  }

  const normalizedDni = documentNumber.replace(/[.\s-]+/g, "");

  if (!/^\d+$/.test(normalizedDni)) {
    context.addIssue({
      code: "custom",
      message: "Ingresá un DNI válido usando solo números.",
      path: ["documentNumber"],
    });
  }
}

function isDocumentType(value: string): value is "dni" | "other" | "passport" {
  return value === "dni" || value === "passport" || value === "other";
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

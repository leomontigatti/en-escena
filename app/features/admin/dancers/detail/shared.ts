import { z } from "zod";

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
import { buildBirthDateRefinement } from "@/lib/dancers/birth-date";
import {
  getArchiveKeepsRosterMessage,
  getRosterPersonParticipatingMessage,
} from "@/lib/roster/roster-person-status.shared";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";
import {
  isUnexpectedActionError,
  type UnexpectedActionError,
} from "@/lib/shared/recoverable-client-action";

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
   * Answered by `findActiveEventParticipation`, the same reader the guard in
   * `setRosterPersonStatus` asks. One reader for both, so the screen cannot
   * grey out a button the server would honour — or offer one it would refuse.
   */
  isParticipatingInActiveEvent: boolean;
  selectedEventId: string | null;
};

/**
 * `values` is absent when the failure was not a rejected edit: a refused
 * archive has no form to repopulate, and that absence is what re-opens the
 * confirmation dialog in `getInitialDialogIntent`.
 */
export type DancerActionError = {
  status: "error";
  message: string;
  fieldErrors: DancerFieldErrors;
  values?: DancerUpdateInput;
};

export type DancerDialogIntent =
  "archive-dancer" | "reactivate-dancer" | "save" | "verify";

export type DancerActionSuccess = {
  status: "success";
  message: string;
  recategorisedChoreographies: RecategorisedChoreography[];
};

export type DancerDetailActionData = DancerActionError | DancerActionSuccess;

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
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      birthDate: z
        .string()
        .trim()
        .min(1, requiredFieldMessage)
        .superRefine(buildBirthDateRefinement(eventStartDate)),
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
      documentFrontImageStorageKey: z.string().trim(),
      documentBackImageStorageKey: z.string().trim(),
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
): DancerActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
  };
}

function isDancerUpdateValues(
  values: DancerActionError["values"] | undefined,
): values is DancerUpdateInput {
  return (
    values !== undefined &&
    "firstName" in values &&
    "lastName" in values &&
    "birthDate" in values &&
    "documentType" in values &&
    "documentNumber" in values &&
    "documentFrontImageStorageKey" in values &&
    "documentBackImageStorageKey" in values
  );
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
  isParticipatingInActiveEvent,
}: {
  active: boolean;
  isParticipatingInActiveEvent: boolean;
}): DancerStatusAction {
  return active
    ? {
        disabled: isParticipatingInActiveEvent,
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
  statusIntent,
}: {
  actionData: DancerActionError | UnexpectedActionError | undefined;
  shouldConfirmSave: boolean;
  statusIntent: DancerStatusAction["intent"];
}): DancerDialogIntent | null {
  if (!actionData) {
    return null;
  }

  const submittedValues =
    "values" in actionData ? actionData.values : undefined;

  if (isDancerUpdateValues(submittedValues)) {
    return shouldConfirmSave ? "save" : null;
  }

  // Carrying no update `values` is how a failed status change comes back —a
  // refused archive, for one— and that is what re-opens the
  // archive/reactivate dialog. The generic error from
  // `recoverableClientAction` carries none either, but it may just as well
  // come from `Guardar`: the toast already reports it and the form stays
  // mounted, so opening a dialog the admin never asked for would be wrong.
  // `fieldErrors` is what tells the two apart: every failure this feature
  // builds carries the key, and the generic one carries nothing but a message.
  if (isUnexpectedActionError(actionData) && !("fieldErrors" in actionData)) {
    return null;
  }

  return statusIntent;
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
  const statusAction = getDancerStatusAction({
    active: dancer.active,
    isParticipatingInActiveEvent,
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
    // Only beside a disabled archive: an archived participant is offered
    // `Reactivar`, which this rule never refuses, and an alert there would
    // explain an unavailability that is not happening.
    participatingAlert: statusAction.disabled
      ? getRosterPersonParticipatingMessage("dancer")
      : null,
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

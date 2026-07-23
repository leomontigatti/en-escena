import { z } from "zod";

import type {
  AdministrativeDancerFieldErrors,
  AdministrativeDancerUpdateInput,
  DancerEditConsequence,
  findAdministrativeDancer,
} from "@/lib/admin/dancers/dancers.server";

export type { DancerEditConsequence };
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";

export const dancerFieldNames = [
  "firstName",
  "lastName",
  "birthDate",
  "documentType",
  "documentNumber",
  "documentFrontImageStorageKey",
  "documentBackImageStorageKey",
] as const satisfies ReadonlyArray<keyof AdministrativeDancerFieldErrors>;

export type DancerDetailLoaderData = {
  backToList: string;
  cancelHref: string;
  canEdit: boolean;
  dancer: NonNullable<Awaited<ReturnType<typeof findAdministrativeDancer>>>;
  documentImageUrls: {
    back: string | null;
    front: string | null;
  };
  editHref: string;
  isEditing: boolean;
  selectedEventId: string | null;
};

export type DancerActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerUpdateInput;
};

export type DancerDialogIntent =
  | "archive-dancer"
  | "reactivate-dancer"
  | "save"
  | "verify";

export type DancerActionSuccess = {
  status: "success";
  message: string;
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
  shouldConfirmSave: boolean;
  statusAction: DancerStatusAction;
};

export type DancerEditFormValues = AdministrativeDancerUpdateInput;

export function buildDancerUpdateSchema() {
  return z
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      birthDate: z
        .string()
        .trim()
        .min(1, requiredFieldMessage)
        .superRefine((value, context) => {
          if (value.length === 0) {
            return;
          }

          if (!isDateOnly(value)) {
            context.addIssue({
              code: "custom",
              message: "Usá una fecha válida.",
            });
            return;
          }

          if (isFutureDateOnly(value)) {
            context.addIssue({
              code: "custom",
              message: "La fecha de nacimiento no puede ser futura.",
            });
          }
        }),
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

// La edición en el lugar del detalle no redirige: retorna
// `{ status: "success", message }`, el loader revalida y la vista dispara el
// toast directo desde `actionData`. Ver docs/agents/form-feedback.md.
export function buildDancerActionSuccess(
  notification: DancerRouteNotification,
): DancerActionSuccess {
  return {
    status: "success",
    message: notificationToasts[notification].message,
  };
}

export function readDancerUpdateValues(
  formData: FormData,
): AdministrativeDancerUpdateInput {
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
  values: DancerActionError["values"],
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
): values is AdministrativeDancerUpdateInput {
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
): AdministrativeDancerUpdateInput | null {
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

function getDancerStatusAction(active: boolean): DancerStatusAction {
  return active
    ? {
        description:
          "Archivá este Bailarín para que deje de aparecer en futuras selecciones del portal sin desvincular sus coreografías existentes.",
        intent: "archive-dancer",
        label: "Archivar",
      }
    : {
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
  actionData: DancerActionError | undefined;
  shouldConfirmSave: boolean;
  statusIntent: DancerStatusAction["intent"];
}): DancerDialogIntent | null {
  if (!actionData) {
    return null;
  }

  if (isDancerUpdateValues(actionData.values) && shouldConfirmSave) {
    return "save";
  }

  if (!isDancerUpdateValues(actionData.values)) {
    return statusIntent;
  }

  return null;
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
  requestedEditMode,
  watchedBirthDate,
}: {
  actionData: DancerActionError | undefined;
  canEdit: boolean;
  dancer: DancerDetailLoaderData["dancer"];
  requestedEditMode: boolean;
  watchedBirthDate: string;
}): DancerDetailViewState {
  const isEditing = canEdit && (requestedEditMode || Boolean(actionData));
  const statusAction = getDancerStatusAction(dancer.active);
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

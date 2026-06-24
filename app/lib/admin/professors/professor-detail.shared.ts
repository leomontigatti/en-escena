import { z } from "zod";

import { adminProfessorCorrectionReasonMessage } from "@/lib/admin/professors/professors.shared";
import type {
  AdministrativeProfessorFieldErrors,
  AdministrativeProfessorUpdateInput,
  findAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import type { RouteNotificationKey } from "@/lib/shared/route-notification-toasts";

const correctionReasonMaxLength = 500;
const correctionReasonMinLength = 10;

export const noDocumentTypeSelectValue = "sin-documento";

export const professorFieldNames = [
  "firstName",
  "lastName",
  "documentType",
  "documentNumber",
  "correctionReason",
] as const satisfies ReadonlyArray<keyof AdministrativeProfessorFieldErrors>;

export const emptyProfessorFieldErrors: AdministrativeProfessorFieldErrors = {};

export type ProfessorDetailLoaderData = {
  backToList: string;
  cancelHref: string;
  canEdit: boolean;
  editHref: string;
  isEditing: boolean;
  professor: NonNullable<
    Awaited<ReturnType<typeof findAdministrativeProfessor>>
  >;
  selectedEventId: string | null;
};

export type ProfessorEditFormValues = Omit<
  AdministrativeProfessorUpdateInput,
  "correctionReason"
>;

export type ProfessorReasonFormValues = {
  correctionReason: string;
  statusIntent: "" | "archive-professor" | "reactivate-professor";
};

export type ProfessorActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeProfessorFieldErrors;
  values: AdministrativeProfessorUpdateInput | ProfessorReasonFormValues;
};

export type ProfessorRouteNotification = Extract<
  RouteNotificationKey,
  "profesor-archivado" | "profesor-guardado" | "profesor-reactivado"
>;

export type ProfessorDialogIntent =
  | "archive-professor"
  | "reactivate-professor"
  | "update-professor";

export type ProfessorConfirmationAction = {
  confirmLabel: string;
  confirmTitle: string;
  description: string;
  intent: ProfessorDialogIntent;
  variant: "default" | "destructive";
};

export function formatProfessorDocumentType(
  documentType: "dni" | "other" | "passport" | null,
) {
  switch (documentType) {
    case "dni":
      return "DNI";
    case "passport":
      return "Pasaporte";
    case "other":
      return "Otro";
    case null:
      return "";
  }
}

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
      confirmTitle: "Confirmar guardado",
      description:
        "Este profesor tiene participación actual o histórica. Ingresá el motivo de corrección para guardar los cambios.",
      intent: "update-professor",
      variant: "default",
    };
  }

  if (active) {
    return {
      confirmLabel: "Archivar",
      confirmTitle: "¿Archivar profesor?",
      description:
        "El profesor dejará de aparecer en las vistas activas y en próximas selecciones del portal. Sus participaciones históricas se mantienen.",
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
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
    })
    .superRefine((values, context) => {
      validateDocumentPair(values.documentType, values.documentNumber, context);
    });
}

export function buildProfessorUpdateSchema(correctionReasonRequired: boolean) {
  return buildProfessorEditSchema().extend({
    correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
  });
}

export function buildProfessorReasonSchema(correctionReasonRequired: boolean) {
  return z.object({
    correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
    statusIntent: z.union([
      z.literal(""),
      z.literal("archive-professor"),
      z.literal("reactivate-professor"),
    ]),
  });
}

export function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
}

export function buildModeHref(url: URL, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("evento");
  searchParams.delete("notificacion");

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

export function buildDetailNotificationHref(
  requestUrl: string,
  professorId: string,
  notification: ProfessorRouteNotification,
) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  searchParams.set("notificacion", notification);

  return `/administracion/profesores/${professorId}?${searchParams.toString()}`;
}

export function readProfessorReasonValues(
  formData: FormData,
): ProfessorReasonFormValues {
  return {
    correctionReason: readFormString(formData, "correctionReason"),
    statusIntent: readProfessorStatusIntent(formData),
  };
}

export function readProfessorUpdateValues(
  formData: FormData,
): AdministrativeProfessorUpdateInput {
  return {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

export function buildProfessorActionError(
  message: string,
  fieldErrors: ProfessorActionError["fieldErrors"],
  values: ProfessorActionError["values"],
): ProfessorActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
  };
}

export function isProfessorUpdateValues(
  values: ProfessorActionError["values"] | undefined,
): values is AdministrativeProfessorUpdateInput {
  return (
    values !== undefined &&
    "firstName" in values &&
    "lastName" in values &&
    "documentType" in values &&
    "documentNumber" in values
  );
}

export function isProfessorStatusValues(
  values: ProfessorActionError["values"] | undefined,
): values is ProfessorReasonFormValues {
  return values !== undefined && "statusIntent" in values;
}

export function getSubmittedProfessorUpdateValues(
  actionData: ProfessorActionError | undefined,
): AdministrativeProfessorUpdateInput | null {
  return isProfessorUpdateValues(actionData?.values) ? actionData.values : null;
}

export function getProfessorEditValues({
  actionData,
  professor,
}: {
  actionData: ProfessorActionError | undefined;
  professor: ProfessorDetailLoaderData["professor"];
}): ProfessorEditFormValues {
  const submittedValues = getSubmittedProfessorUpdateValues(actionData);

  return {
    firstName: submittedValues?.firstName ?? professor.firstName,
    lastName: submittedValues?.lastName ?? professor.lastName,
    documentType: submittedValues?.documentType ?? professor.documentType ?? "",
    documentNumber:
      submittedValues?.documentNumber ?? professor.documentNumber ?? "",
  };
}

export function getProfessorReasonValues(
  actionData: ProfessorActionError | undefined,
): ProfessorReasonFormValues {
  return {
    correctionReason: actionData?.values.correctionReason ?? "",
    statusIntent: isProfessorStatusValues(actionData?.values)
      ? actionData.values.statusIntent
      : "",
  };
}

export function getProfessorEditFieldErrors(
  fieldErrors: AdministrativeProfessorFieldErrors | undefined,
): AdministrativeProfessorFieldErrors {
  if (!fieldErrors) {
    return emptyProfessorFieldErrors;
  }

  const { correctionReason: _correctionReason, ...editFieldErrors } =
    fieldErrors;
  return editFieldErrors;
}

export function getProfessorReasonFieldErrors(
  fieldErrors: AdministrativeProfessorFieldErrors | undefined,
): AdministrativeProfessorFieldErrors {
  if (!fieldErrors?.correctionReason) {
    return emptyProfessorFieldErrors;
  }

  return {
    correctionReason: fieldErrors.correctionReason,
  };
}

export function getInitialDialogIntent(
  actionData: ProfessorActionError | undefined,
  correctionReasonRequired: boolean,
): ProfessorDialogIntent | null {
  if (!actionData || !actionData.fieldErrors.correctionReason) {
    return null;
  }

  if (isProfessorUpdateValues(actionData.values) && correctionReasonRequired) {
    return "update-professor";
  }

  if (isProfessorStatusValues(actionData.values)) {
    return actionData.values.statusIntent || "archive-professor";
  }

  return null;
}

export function toProfessorEditValues(
  values: AdministrativeProfessorUpdateInput,
): ProfessorEditFormValues {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    documentType: values.documentType,
    documentNumber: values.documentNumber,
  };
}

export function getProfessorDialogFormId(intent: ProfessorDialogIntent | null) {
  switch (intent) {
    case "archive-professor":
      return "administracion-profesor-archive-form";
    case "reactivate-professor":
      return "administracion-profesor-reactivate-form";
    case "update-professor":
      return "administracion-profesor-save-form";
    case null:
      return "administracion-profesor-dialog-form";
  }
}

function buildCorrectionReasonSchema(required: boolean) {
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (value.length === 0) {
        if (required) {
          context.addIssue({
            code: "custom",
            message: adminProfessorCorrectionReasonMessage,
          });
        }

        return;
      }

      if (
        value.length < correctionReasonMinLength ||
        value.length > correctionReasonMaxLength
      ) {
        context.addIssue({
          code: "custom",
          message: adminProfessorCorrectionReasonMessage,
        });
      }
    });
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
      message: "Ingresá un DNI válido.",
      path: ["documentNumber"],
    });
  }
}

function isDocumentType(value: string): value is "dni" | "other" | "passport" {
  return value === "dni" || value === "passport" || value === "other";
}

function readProfessorIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readProfessorStatusIntent(
  formData: FormData,
): ProfessorReasonFormValues["statusIntent"] {
  const value = readFormString(formData, "statusIntent");

  if (value === "archive-professor" || value === "reactivate-professor") {
    return value;
  }

  return "";
}

import { z } from "zod";

import { adminProfessorCorrectionReasonMessage } from "@/lib/admin/professors/professors.shared";
import type {
  AdministrativeProfessorFieldErrors,
  AdministrativeProfessorUpdateInput,
  findAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";

const correctionReasonMaxLength = 500;
const correctionReasonMinLength = 10;

export const professorFieldNames = [
  "firstName",
  "lastName",
  "documentType",
  "documentNumber",
  "correctionReason",
] as const satisfies ReadonlyArray<keyof AdministrativeProfessorFieldErrors>;

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

export type ProfessorActionSuccess = {
  status: "success";
  message: string;
};

export type ProfessorDetailActionData =
  | ProfessorActionError
  | ProfessorActionSuccess;

export type ProfessorRouteNotification = Extract<
  NotificationKey,
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

// La edición en el lugar del detalle no redirige: retorna
// `{ status: "success", message }`, el loader revalida y la vista dispara el
// toast directo desde `actionData`. Ver docs/agents/form-feedback.md.
export function buildProfessorActionSuccess(
  notification: ProfessorRouteNotification,
): ProfessorActionSuccess {
  return {
    status: "success",
    message: notificationToasts[notification].message,
  };
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

function isProfessorUpdateValues(
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

function isProfessorStatusValues(
  values: ProfessorActionError["values"] | undefined,
): values is ProfessorReasonFormValues {
  return values !== undefined && "statusIntent" in values;
}

export function getSubmittedProfessorUpdateValues(
  actionData: ProfessorActionError | undefined,
): AdministrativeProfessorUpdateInput | null {
  return isProfessorUpdateValues(actionData?.values) ? actionData.values : null;
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

export function getProfessorReasonValues(
  actionData?: ProfessorActionError,
): ProfessorReasonFormValues {
  if (isProfessorStatusValues(actionData?.values)) {
    return actionData.values;
  }

  return {
    correctionReason: "",
    statusIntent: "",
  };
}

export function getInitialDialogIntent(
  actionData: ProfessorActionError | undefined,
  correctionReasonRequired: boolean,
): ProfessorDialogIntent | null {
  if (!actionData) {
    return null;
  }

  if (
    isProfessorStatusValues(actionData.values) &&
    actionData.values.statusIntent !== ""
  ) {
    return actionData.values.statusIntent;
  }

  if (
    correctionReasonRequired &&
    isProfessorUpdateValues(actionData.values) &&
    actionData.fieldErrors.correctionReason
  ) {
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

      if (value.length < correctionReasonMinLength) {
        context.addIssue({
          code: "custom",
          message: `Ingresá al menos ${correctionReasonMinLength} caracteres.`,
        });
      }

      if (value.length > correctionReasonMaxLength) {
        context.addIssue({
          code: "custom",
          message: `Usá hasta ${correctionReasonMaxLength} caracteres.`,
        });
      }
    });
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

function readProfessorStatusIntent(
  formData: FormData,
): ProfessorReasonFormValues["statusIntent"] {
  const value = formData.get("statusIntent");

  if (
    value === "archive-professor" ||
    value === "reactivate-professor" ||
    value === ""
  ) {
    return value;
  }

  return "";
}

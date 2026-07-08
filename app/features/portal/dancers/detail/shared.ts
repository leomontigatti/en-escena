import { z } from "zod";

import type {
  findDancerForAcademy,
  UpdateDancerField,
} from "@/lib/portal/dancers.server";
import type {
  DancerIdentificationPendingItem,
  DancerVerificationStatus,
} from "@/lib/dancers/verification";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const portalDancerNotFoundMessage = "No encontramos ese Bailarín.";
export const portalDancerFormId = "portal-bailarin-form";
export const dancerDocumentImageAccept = "image/jpeg,image/png,image/webp";
export const dancerDocumentImageAllowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const dancerDocumentImageMaxFileSizeBytes = 10 * 1024 * 1024;

export const dancerSchema = z
  .object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    birthDate: z.string().trim().min(1, requiredFieldMessage),
    documentType: z.string().trim(),
    documentNumber: z.string().trim(),
    documentFrontImageStorageKey: z.string().trim(),
    documentBackImageStorageKey: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (!values.documentType && !values.documentNumber) {
      return;
    }

    if (!values.documentType) {
      context.addIssue({
        code: "custom",
        message: "Seleccioná el tipo de documento.",
        path: ["documentType"],
      });
    }

    if (!values.documentNumber) {
      context.addIssue({
        code: "custom",
        message: "Ingresá el número de documento.",
        path: ["documentNumber"],
      });
    }
  });

export type PortalDancerDetailLoaderData = {
  dancer: NonNullable<Awaited<ReturnType<typeof findDancerForAcademy>>>;
  documentImageUrls: PortalDancerDocumentImageUrls;
};

export type PortalDancerDetailActionData = {
  status: "error";
  message: string;
  fieldErrors: Partial<Record<UpdateDancerField, string>>;
  values: PortalDancerFormValues;
};

export type PortalDancerFormValues = z.infer<typeof dancerSchema>;
export type PortalDancerDocumentImageUrls = {
  back: string | null;
  front: string | null;
};
export type PortalDancerStatusIntent = "archive-dancer" | "reactivate-dancer";
export type PortalDancerDetailViewModel = {
  detailHref: string;
  identificationPendingItems: DancerIdentificationPendingItem[];
  identityFieldValues: Pick<
    PortalDancerFormValues,
    | "birthDate"
    | "documentBackImageStorageKey"
    | "documentFrontImageStorageKey"
    | "documentNumber"
    | "documentType"
  >;
  isIdentityVerified: boolean;
  showsIdentificationAlert: boolean;
  showsPendingVerificationAlert: boolean;
  showsVerifiedIdentityAlert: boolean;
  statusAction: PortalDancerStatusAction;
  title: string;
  verificationStatus: DancerVerificationStatus;
};
type PortalDancerStatusAction = {
  intent: PortalDancerStatusIntent;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonLabel: string;
  confirmButtonVariant: "default" | "destructive";
};

export const portalDancerStatusActions = {
  "archive-dancer": {
    intent: "archive-dancer",
    label: "Archivar",
    confirmTitle: "¿Archivar bailarín?",
    confirmDescription:
      "El bailarín dejará de aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Archivar",
    confirmButtonVariant: "destructive",
  },
  "reactivate-dancer": {
    intent: "reactivate-dancer",
    label: "Reactivar",
    confirmTitle: "¿Reactivar bailarín?",
    confirmDescription:
      "El bailarín volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Reactivar",
    confirmButtonVariant: "default",
  },
} as const satisfies Record<PortalDancerStatusIntent, PortalDancerStatusAction>;

export function readPortalDancerId(params: { dancerId?: string }) {
  if (!params.dancerId) {
    throw new Response(portalDancerNotFoundMessage, { status: 404 });
  }

  return params.dancerId;
}

export function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export function readPortalDancerFormValues(
  formData: FormData,
): PortalDancerFormValues {
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

export function getPortalDancerFormValues(input: {
  actionData?: PortalDancerDetailActionData;
  dancer: PortalDancerDetailLoaderData["dancer"];
}): PortalDancerFormValues {
  const { actionData, dancer } = input;

  return (
    actionData?.values ?? {
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      birthDate: dancer.birthDate,
      documentType: dancer.documentType ?? "",
      documentNumber: dancer.documentNumber ?? "",
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey ?? "",
      documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
    }
  );
}

export function getClientDocumentImageValidationMessage(formData: FormData) {
  const frontError = readFormString(
    formData,
    "documentFrontImageValidationError",
  );

  if (frontError) {
    return frontError;
  }

  const backError = readFormString(
    formData,
    "documentBackImageValidationError",
  );

  return backError || null;
}

export function getGeneralActionError(
  actionData?: PortalDancerDetailActionData,
) {
  if (!actionData) {
    return null;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}

function getPortalDancerStatusAction(isActive: boolean) {
  if (isActive) {
    return portalDancerStatusActions["archive-dancer"];
  }

  return portalDancerStatusActions["reactivate-dancer"];
}

export function buildPortalDancerDetailViewModel(input: {
  dancer: PortalDancerDetailLoaderData["dancer"];
  formValues: PortalDancerFormValues;
  identificationPendingItems: PortalDancerDetailViewModel["identificationPendingItems"];
  verificationStatus: PortalDancerDetailViewModel["verificationStatus"];
}): PortalDancerDetailViewModel {
  const { dancer, formValues, identificationPendingItems, verificationStatus } =
    input;
  const isIdentityVerified = verificationStatus === "verified";

  return {
    detailHref: `/portal/bailarines/${dancer.id}`,
    identificationPendingItems,
    identityFieldValues: isIdentityVerified
      ? {
          birthDate: dancer.birthDate,
          documentType: dancer.documentType ?? "",
          documentNumber: dancer.documentNumber ?? "",
          documentFrontImageStorageKey:
            dancer.documentFrontImageStorageKey ?? "",
          documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
        }
      : {
          birthDate: formValues.birthDate,
          documentType: formValues.documentType,
          documentNumber: formValues.documentNumber,
          documentFrontImageStorageKey: formValues.documentFrontImageStorageKey,
          documentBackImageStorageKey: formValues.documentBackImageStorageKey,
        },
    isIdentityVerified,
    showsIdentificationAlert: verificationStatus === "incomplete",
    showsPendingVerificationAlert: verificationStatus === "unverified",
    showsVerifiedIdentityAlert: verificationStatus === "verified",
    statusAction: getPortalDancerStatusAction(dancer.active),
    title: `${dancer.firstName} ${dancer.lastName}`,
    verificationStatus,
  };
}

export function getPortalDancerStatusFormId(
  intent: PortalDancerStatusIntent | null,
) {
  switch (intent) {
    case "archive-dancer":
      return "portal-bailarin-archive-form";
    case "reactivate-dancer":
      return "portal-bailarin-reactivate-form";
    case null:
      return "portal-bailarin-status-form";
  }
}

export function getPortalDancerFieldAutoComplete(
  name:
    | "documentBackImageStorageKey"
    | "documentFrontImageStorageKey"
    | "documentNumber"
    | "firstName"
    | "lastName",
) {
  switch (name) {
    case "firstName":
      return "given-name";
    case "lastName":
      return "family-name";
    case "documentBackImageStorageKey":
    case "documentFrontImageStorageKey":
    case "documentNumber":
      return "off";
  }
}

export function getDocumentImageStateLabel(storageKey: string) {
  return storageKey ? "Imagen cargada" : "Sin imagen";
}

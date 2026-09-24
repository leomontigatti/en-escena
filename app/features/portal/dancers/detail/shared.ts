import { z } from "zod";

import type { RosterDocumentConflict } from "@/components/shared/roster-document-conflict";

import type {
  findDancerForAcademy,
  UpdateDancerField,
} from "@/lib/portal/dancers.server";
import type { DancerInscription } from "@/lib/dancers/inscriptions";
import type {
  DancerIdentificationPendingItem,
  DancerVerificationStatus,
} from "@/lib/dancers/verification";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
import { buildBirthDateRefinement } from "@/lib/dancers/birth-date";
import {
  getArchiveKeepsRosterMessage,
  getRosterPersonArchiveAvailability,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import { refineDocumentPair } from "@/lib/roster/document-pair-schema";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  withDancerBirthDateScheduleMoveFeedback,
  type DancerBirthDateScheduleMove,
} from "@/lib/choreographies/dancer-birthdate-messages";
import { notificationToasts } from "@/lib/shared/notification-toasts";

export const portalDancerNotFoundMessage = "No encontramos ese Bailarín.";
export const portalDancerFormId = "portal-bailarin-form";
export const portalDancerInvalidValuesMessage =
  "Revisá los datos del Bailarín.";

export function buildPortalDancerSchema(eventStartDate: string | null) {
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
    .superRefine(refineDocumentPair);
}

export type PortalDancerDetailLoaderData = {
  activeEventStartDate: string | null;
  dancer: NonNullable<Awaited<ReturnType<typeof findDancerForAcademy>>>;
  documentImageUrls: PortalDancerDocumentImageUrls;
  inscriptions: DancerInscription[];
  /**
   * Answered by `hasActiveEventParticipation`, the same reader the guard in
   * `setRosterPersonStatus` asks — see the panel twin. It resolves the active
   * event itself rather than reading `selectedEventId`, because the rule is
   * about a commitment that is live now.
   */
  isParticipatingInActiveEvent: boolean;
  selectedEventId: string | null;
};

export type PortalDancerDetailActionData =
  | {
      status: "error";
      message: string;
      fieldErrors: Partial<Record<UpdateDancerField, string>>;
      // Absent when the failure was not a rejected edit: a refused archive has
      // no form to repopulate.
      values?: PortalDancerFormValues;
      // The dancer already holding the document number, so the form can link to
      // them when the match is an archived one.
      duplicateDocumentDancerId?: string;
    }
  | {
      status: "success";
      message: string;
      recategorisedChoreographies: RecategorisedChoreography[];
    };

/**
 * The portal's success payload. Every intent names its recategorisation report
 * explicitly, even the ones that cannot cause one — see the admin twin in
 * `app/features/admin/dancers/detail/shared.ts`.
 */
export function buildPortalDancerActionSuccess(
  notification:
    "bailarin-archivado" | "bailarin-guardado" | "bailarin-reactivado",
  recategorisedChoreographies: RecategorisedChoreography[],
  scheduleMoves: DancerBirthDateScheduleMove[] = [],
): PortalDancerDetailActionData {
  return {
    status: "success",
    message: withDancerBirthDateScheduleMoveFeedback(
      notificationToasts[notification].message,
      scheduleMoves,
    ),
    recategorisedChoreographies,
  };
}

export type PortalDancerFormValues = z.infer<
  ReturnType<typeof buildPortalDancerSchema>
>;
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
    | "firstName"
    | "lastName"
  >;
  isIdentityVerified: boolean;
  showsIdentificationAlert: boolean;
  showsPendingVerificationAlert: boolean;
  showsVerifiedIdentityAlert: boolean;
  /**
   * Why the archive action is unavailable, or `null` when it is available.
   * Informational: nothing is wrong when it shows.
   */
  participatingAlert: string | null;
  statusAction: PortalDancerStatusAction;
  title: string;
  verificationStatus: DancerVerificationStatus;
};
type PortalDancerStatusActionCopy = {
  intent: PortalDancerStatusIntent;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonLabel: string;
  confirmButtonVariant: "default" | "destructive";
};

type PortalDancerStatusAction = PortalDancerStatusActionCopy & {
  /**
   * A courtesy in front of the guard, never the rule: the server refuses the
   * archive whether or not this is honoured. Reactivating is never refused, so
   * only the archive intent is ever disabled.
   */
  disabled: boolean;
};

export const portalDancerStatusActions = {
  "archive-dancer": {
    intent: "archive-dancer",
    label: "Archivar",
    confirmTitle: "¿Archivar bailarín?",
    confirmDescription: `El bailarín dejará de aparecer en listas activas y en próximas selecciones de coreografías. ${getArchiveKeepsRosterMessage("dancer")}`,
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
} as const satisfies Record<
  PortalDancerStatusIntent,
  PortalDancerStatusActionCopy
>;

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
  const submittedValues =
    actionData?.status === "error" ? actionData.values : undefined;

  return (
    submittedValues ?? {
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

/**
 * The document refusal the portal dancer action can answer with, read for the
 * field it belongs to.
 */
export function getPortalDancerDocumentConflict(
  actionData?: PortalDancerDetailActionData,
): RosterDocumentConflict {
  if (actionData?.status !== "error") {
    return {};
  }

  const matchId = actionData.duplicateDocumentDancerId;

  return {
    matchHref: matchId ? `/portal/bailarines/${matchId}` : undefined,
    matchLabel: "Ver la ficha del bailarín con ese documento",
    message: actionData.fieldErrors.documentNumber,
  };
}

export function getGeneralActionError(
  actionData?: PortalDancerDetailActionData,
) {
  if (actionData?.status !== "error") {
    return null;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}

function getPortalDancerStatusAction({
  isActive,
  isArchiveDisabled,
}: {
  isActive: boolean;
  isArchiveDisabled: boolean;
}): PortalDancerStatusAction {
  if (isActive) {
    return {
      ...portalDancerStatusActions["archive-dancer"],
      disabled: isArchiveDisabled,
    };
  }

  return {
    ...portalDancerStatusActions["reactivate-dancer"],
    disabled: false,
  };
}

export function buildPortalDancerDetailViewModel(input: {
  dancer: PortalDancerDetailLoaderData["dancer"];
  formValues: PortalDancerFormValues;
  identificationPendingItems: PortalDancerDetailViewModel["identificationPendingItems"];
  isParticipatingInActiveEvent: boolean;
  verificationStatus: PortalDancerDetailViewModel["verificationStatus"];
}): PortalDancerDetailViewModel {
  const {
    dancer,
    formValues,
    identificationPendingItems,
    isParticipatingInActiveEvent,
    verificationStatus,
  } = input;
  const isIdentityVerified = verificationStatus === "verified";
  const archiveAvailability = getRosterPersonArchiveAvailability({
    isParticipatingInActiveEvent,
    kind: "dancer",
    status: toRosterPersonStatus(dancer.active),
  });
  const statusAction = getPortalDancerStatusAction({
    isActive: dancer.active,
    isArchiveDisabled: archiveAvailability.disabled,
  });

  return {
    detailHref: `/portal/bailarines/${dancer.id}`,
    identificationPendingItems,
    identityFieldValues: isIdentityVerified
      ? {
          firstName: dancer.firstName,
          lastName: dancer.lastName,
          birthDate: dancer.birthDate,
          documentType: dancer.documentType ?? "",
          documentNumber: dancer.documentNumber ?? "",
          documentFrontImageStorageKey:
            dancer.documentFrontImageStorageKey ?? "",
          documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
        }
      : {
          firstName: formValues.firstName,
          lastName: formValues.lastName,
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
    participatingAlert: archiveAvailability.participatingAlert,
    statusAction,
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

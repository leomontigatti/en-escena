import {
  buildModalidadDetallePath,
  buildModalidadesListPath,
  isModalityDetailPath,
} from "@/lib/admin/events/event-bases-navigation";
import {
  readNameActionValues,
  readSubmodalitiesInput,
} from "@/lib/admin/events/bases-action/input.server";
import type {
  ActionErrorScope,
  EventBasesActionInput,
  EventBasesActionResult,
  EventBasesActionValues,
  ModalityActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  buildDefaultActionErrorScope,
  buildParentRecordActionScope,
  buildRecordActionScope,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  withEventBasesNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createModality,
  createSubmodality,
  deleteModality,
  deleteSubmodality,
  updateModality,
  updateModalityWithSubmodalities,
  updateSubmodality,
} from "@/lib/events/bases-repository.server";

const modalitySavedNotification = "modalidad-guardada";
const modalityDeletedNotification = "modalidad-eliminada";

export function handlesModalityIntent(intent: string) {
  return (
    intent === "create-modality" ||
    intent === "update-modality" ||
    intent === "delete-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality"
  );
}

export function getModalityConfirmationError(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  if (
    input.intent === "delete-modality" &&
    isModalityDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  ) {
    return {
      message: "Confirmá el borrado de la modalidad.",
      fieldErrors: {},
    };
  }

  return null;
}

export function buildModalityActionErrorScope(
  input: EventBasesActionInput,
): ActionErrorScope | null {
  if (!handlesModalityIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  switch (input.intent) {
    case "create-submodality":
      return buildParentRecordActionScope(input.intent, input.modalityId);
    case "update-submodality":
      return {
        intent: input.intent,
        recordId: input.id || undefined,
        parentRecordId: input.modalityId || undefined,
      };
    default:
      return buildRecordActionScope(input.intent, input.id);
  }
}

export function readModalitySubmittedValues(
  input: EventBasesActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (isModalityFormMutation(input)) {
    return readModalityActionValues(formData);
  }

  if (
    input.intent === "create-modality" ||
    input.intent === "update-modality" ||
    input.intent === "create-submodality" ||
    input.intent === "update-submodality"
  ) {
    return readNameActionValues(formData);
  }

  return undefined;
}

export async function runModalityIntent(
  input: EventBasesActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-modality":
      return createModality(input.eventId, { name: input.name });
    case "update-modality":
      if (isModalityFormMutation(input)) {
        return updateModalityWithSubmodalities(input.id, {
          name: input.name,
          submodalities: input.submodalities,
        });
      }

      return updateModality(input.id, { name: input.name });
    case "delete-modality":
      return deleteModality(input.id);
    case "create-submodality":
      return createSubmodality(input.eventId, {
        modalityId: input.modalityId,
        name: input.name,
      });
    case "update-submodality":
      return updateSubmodality(input.id, {
        modalityId: input.modalityId,
        name: input.name,
      });
    case "delete-submodality":
      return deleteSubmodality(input.id);
    default:
      return invalidEventBasesActionResult();
  }
}

export function buildModalityRedirectUrl(
  requestUrl: string,
  input: EventBasesActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-modality") {
    return withEventBasesNotification(
      buildModalidadesListPath(null),
      modalityDeletedNotification,
    );
  }

  if (
    input.intent === "create-modality" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildModalidadDetallePath(result.record.id, null),
      modalitySavedNotification,
    );
  }

  if (isModalityMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      modalitySavedNotification,
    );
  }

  return currentUrl.pathname;
}

function isModalityMutationIntent(intent: string) {
  return (
    intent === "update-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality"
  );
}

function isModalityFormMutation(input: EventBasesActionInput) {
  return (
    input.intent === "update-modality" && input.submodalitiesMode === "replace"
  );
}

function readModalityActionValues(formData: FormData): ModalityActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    submodalities: readSubmodalitiesInput(formData),
  };
}

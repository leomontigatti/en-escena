import { modalityFormSchema } from "@/features/admin/modalities/view-shared";
import { readIndexedFormEntries } from "@/lib/admin/events/bases-action/input.server";
import type {
  ActionErrorScope,
  EventBasesActionBaseInput,
  EventBasesActionResult,
  EventBasesActionValues,
  ModalityActionValues,
  NameActionValues,
  NameActionValuesWithId,
} from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesActionHandler } from "@/lib/admin/events/bases-action/runner.server";
import {
  buildDefaultActionErrorScope,
  buildParentRecordActionScope,
  buildRecordActionScope,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  plainEventBasesRedirect,
  withEventBasesFlashNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createModality,
  createModalityWithSubmodalities,
  createSubmodality,
  deleteModality,
  deleteSubmodality,
  updateModality,
  updateModalityWithSubmodalities,
  updateSubmodality,
} from "@/lib/modalities/repository.server";
import {
  buildDetailPath,
  buildListPath,
  isDetailPath,
} from "@/lib/shared/navigation";

const modalityBasePath = "/administracion/modalidades";
const modalitySavedNotification = "modalidad-guardada";
const modalityDeletedNotification = "modalidad-eliminada";
const submodalityFieldNames = ["id", "name"] as const;

type ModalityActionInput = EventBasesActionBaseInput & {
  modalityId: string;
  name: string;
  submodalities: NameActionValuesWithId[];
  submodalitiesMode: string;
};

export const modalityActionHandler: EventBasesActionHandler<ModalityActionInput> =
  {
    readInput: readModalityActionInput,
    buildErrorScope: buildModalityActionErrorScope,
    buildRedirectUrl: buildModalityRedirectUrl,
    getConfirmationError: getModalityConfirmationError,
    readSubmittedValues: readModalitySubmittedValues,
    run: runModalityIntent,
  };

function readModalityActionInput(
  baseInput: EventBasesActionBaseInput,
  formData: FormData,
): ModalityActionInput {
  return {
    ...baseInput,
    modalityId: String(formData.get("modalityId") ?? ""),
    name: String(formData.get("name") ?? ""),
    submodalities: readSubmodalitiesInput(formData),
    submodalitiesMode: String(formData.get("submodalitiesMode") ?? ""),
  };
}

function readNameActionValues(formData: FormData): NameActionValues {
  return {
    name: String(formData.get("name") ?? ""),
  };
}

function readSubmodalitiesInput(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "submodalities",
    fieldNames: submodalityFieldNames,
    createEntry: (): NameActionValuesWithId => ({ name: "" }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "id" && value.trim().length > 0) {
        entry.id = value;
      }

      if (fieldName === "name") {
        entry.name = value;
      }
    },
  });
}

function handlesModalityIntent(intent: string) {
  return (
    intent === "create-modality" ||
    intent === "update-modality" ||
    intent === "delete-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality"
  );
}

function getModalityConfirmationError(
  requestUrl: string,
  input: ModalityActionInput,
) {
  if (
    input.intent === "delete-modality" &&
    isDetailPath(modalityBasePath, requestUrl) &&
    input.confirmDeletion !== input.id
  ) {
    return {
      message: "Confirmá el borrado de la modalidad.",
      fieldErrors: {},
    };
  }

  return null;
}

function buildModalityActionErrorScope(
  input: ModalityActionInput,
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

function readModalitySubmittedValues(
  input: ModalityActionInput,
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

async function runModalityIntent(
  input: ModalityActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-modality": {
      if (isModalityFormMutation(input)) {
        const validationError = revalidateModalityForm(input);

        if (validationError) {
          return validationError;
        }

        return createModalityWithSubmodalities(input.eventId, {
          name: input.name,
          submodalities: input.submodalities,
        });
      }

      return createModality(input.eventId, { name: input.name });
    }
    case "update-modality":
      if (isModalityFormMutation(input)) {
        const validationError = revalidateModalityForm(input);

        if (validationError) {
          return validationError;
        }

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

function buildModalityRedirectUrl(
  requestUrl: string,
  input: ModalityActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-modality") {
    return withEventBasesFlashNotification(
      buildListPath(modalityBasePath, null),
      modalityDeletedNotification,
    );
  }

  if (
    input.intent === "create-modality" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesFlashNotification(
      buildDetailPath(modalityBasePath, result.record.id, null),
      modalitySavedNotification,
    );
  }

  if (isModalityMutationIntent(input.intent)) {
    return withEventBasesFlashNotification(
      currentUrl.pathname,
      modalitySavedNotification,
    );
  }

  return plainEventBasesRedirect(currentUrl.pathname);
}

function isModalityMutationIntent(intent: string) {
  return (
    intent === "update-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality"
  );
}

function isModalityFormMutation(input: ModalityActionInput) {
  return (
    (input.intent === "create-modality" ||
      input.intent === "update-modality") &&
    input.submodalitiesMode === "replace"
  );
}

/**
 * Re-valida en el servidor las filas anidadas con el **mismo** esquema Zod que
 * usa el cliente (`modalityFormSchema`), cerrando la asimetría cliente/servidor
 * de los formularios de bases (PRD #465). Ante fallo devuelve el error por el
 * canal de `EventBasesActionResult`, que el runner convierte en el round-trip
 * de `submittedValues`/`ActionData` que repuebla el formulario y sus filas.
 */
function revalidateModalityForm(
  input: ModalityActionInput,
): EventBasesActionResult | null {
  const result = modalityFormSchema.safeParse({
    name: input.name,
    submodalities: input.submodalities.map((submodality) => ({
      id: submodality.id,
      name: submodality.name,
    })),
  });

  if (result.success) {
    return null;
  }

  const fieldErrors: Record<string, string> = {};

  for (const issue of result.error.issues) {
    const fieldName = issue.path.join(".");

    if (fieldName && !fieldErrors[fieldName]) {
      fieldErrors[fieldName] = issue.message;
    }
  }

  return {
    ok: false,
    code: "invalid-event-bases",
    error: "Revisá los datos de la modalidad.",
    fieldErrors,
  };
}

function readModalityActionValues(formData: FormData): ModalityActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    submodalities: readSubmodalitiesInput(formData),
  };
}

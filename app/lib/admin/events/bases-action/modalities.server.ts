import { modalityFormSchema } from "@/features/admin/modalities/view-shared";
import { readIndexedFormEntries } from "@/lib/admin/events/bases-action/input.server";
import { replaceSubmodalityCriteria } from "@/lib/judging/criteria.server";
import { criterionKinds, type CriterionKind } from "@/lib/judging/criteria";
import type {
  ActionErrorScope,
  EventBasesActionBaseInput,
  EventBasesActionResult,
  EventBasesActionValues,
  ModalityActionValues,
  NameActionValues,
  NameActionValuesWithId,
  SubmodalityCriteriaActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesActionHandler } from "@/lib/admin/events/bases-action/runner.server";
import {
  buildDefaultActionErrorScope,
  buildParentRecordActionScope,
  buildRecordActionScope,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  invalidEventBasesFormResult,
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
const criteriaSavedNotification = "criterios-guardados";
const submodalityFieldNames = ["id", "name"] as const;
const criterionFieldNames = ["kind", "maximum", "name"] as const;

type CriterionActionInput = {
  kind: CriterionKind;
  maximum: string;
  name: string;
};

type ModalityActionInput = EventBasesActionBaseInput & {
  criteria: CriterionActionInput[];
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
    criteria: readCriteriaInput(formData),
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

/**
 * Reads the criteria dialog's field array. The kind arrives from a select whose
 * options are the two kinds, so anything else is a tampered submission and
 * falls back to `adds`, where the "must total 100" rule catches it.
 */
function readCriteriaInput(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "criteria",
    fieldNames: criterionFieldNames,
    createEntry: (): CriterionActionInput => ({
      kind: "adds",
      maximum: "",
      name: "",
    }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "kind") {
        entry.kind = toCriterionKind(value);
      }

      if (fieldName === "maximum") {
        entry.maximum = value;
      }

      if (fieldName === "name") {
        entry.name = value;
      }
    },
  });
}

function toCriterionKind(value: string): CriterionKind {
  return criterionKinds.find((kind) => kind === value) ?? "adds";
}

function readCriteriaActionValues(
  input: ModalityActionInput,
): SubmodalityCriteriaActionValues {
  return {
    criteria: input.criteria.map((criterion) => ({
      kind: criterion.kind,
      maximum: criterion.maximum,
      name: criterion.name,
    })),
  };
}

function handlesModalityIntent(intent: string) {
  return (
    intent === "create-modality" ||
    intent === "update-modality" ||
    intent === "delete-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality" ||
    intent === "save-submodality-criteria"
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
    case "save-submodality-criteria":
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
  if (input.intent === "save-submodality-criteria") {
    return readCriteriaActionValues(input);
  }

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
    case "save-submodality-criteria":
      return replaceSubmodalityCriteria(input.id, { criteria: input.criteria });
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

  if (input.intent === "save-submodality-criteria") {
    return withEventBasesFlashNotification(
      currentUrl.pathname,
      criteriaSavedNotification,
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
 * Revalidates the nested rows on the server with the **same** Zod schema the
 * client uses (`modalityFormSchema`), closing the client/server asymmetry of the
 * bases forms (PRD #465). On failure it returns the error through the
 * `EventBasesActionResult` channel, which the runner turns into the
 * `submittedValues`/`ActionData` round trip that repopulates the form and its
 * rows.
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

  return invalidEventBasesFormResult(
    result.error,
    "Revisá los datos de la modalidad.",
  );
}

function readModalityActionValues(formData: FormData): ModalityActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    submodalities: readSubmodalitiesInput(formData),
  };
}

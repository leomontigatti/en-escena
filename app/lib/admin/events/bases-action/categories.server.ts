import type {
  ActionErrorScope,
  CategoryActionValues,
  EventBasesActionBaseInput,
  EventBasesActionResult,
  EventBasesActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesActionHandler } from "@/lib/admin/events/bases-action/runner.server";
import {
  buildDefaultActionErrorScope,
  buildRecordActionScope,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  plainEventBasesRedirect,
  withEventBasesFlashNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createCategory,
  deleteCategory,
  type EventBasesMutationResult,
  updateCategory,
} from "@/lib/categories/repository.server";
import { buildDetailPath, buildListPath } from "@/lib/shared/navigation";

const categoryBasePath = "/administracion/categorias";
const categorySavedNotification = "categoria-guardada";
const categoryDeletedNotification = "categoria-eliminada";
const categoryDeleteConfirmationMessage =
  "Confirmá el borrado de la categoría antes de continuar.";

export const categoryActionHandler: EventBasesActionHandler<CategoryActionInput> =
  {
    readInput: readCategoryActionInput,
    buildErrorScope: buildCategoryActionErrorScope,
    buildRedirectUrl: buildCategoryRedirectUrl,
    getConfirmationError: getCategoryConfirmationError,
    readSubmittedValues: readCategorySubmittedValues,
    run: runCategoryIntent,
  };

type CategoryMutationIntent = "create-category" | "update-category";
type CategoryMutationInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevels: string[];
};
type CategoryActionInput = EventBasesActionBaseInput & CategoryMutationInput;

function handlesCategoryIntent(intent: string) {
  return isCategoryMutationIntent(intent) || intent === "delete-category";
}

function getCategoryConfirmationError(
  _requestUrl: string,
  input: CategoryActionInput,
) {
  if (
    input.intent === "delete-category" &&
    input.confirmDeletion !== input.id
  ) {
    return {
      message: categoryDeleteConfirmationMessage,
      fieldErrors: {
        confirmDelete: categoryDeleteConfirmationMessage,
      },
    };
  }

  return null;
}

function buildCategoryActionErrorScope(
  input: CategoryActionInput,
): ActionErrorScope | null {
  if (!handlesCategoryIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  return buildRecordActionScope(input.intent, input.id);
}

function readCategorySubmittedValues(
  input: CategoryActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (isCategoryMutationIntent(input.intent)) {
    return readCategoryActionValues(formData);
  }

  return undefined;
}

async function runCategoryIntent(
  input: CategoryActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-category":
    case "update-category":
      return saveCategory(input);
    case "delete-category":
      if (!input.confirmDelete && input.confirmDeletion !== input.id) {
        return {
          ok: false,
          code: "invalid-event-bases",
          error: categoryDeleteConfirmationMessage,
          fieldErrors: {
            confirmDelete: categoryDeleteConfirmationMessage,
          },
        };
      }
      return deleteCategory(input.id);
    default:
      return invalidEventBasesActionResult();
  }
}

function buildCategoryRedirectUrl(
  requestUrl: string,
  input: CategoryActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-category") {
    return withEventBasesFlashNotification(
      buildListPath(categoryBasePath, null),
      categoryDeletedNotification,
    );
  }

  if (
    input.intent === "create-category" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesFlashNotification(
      buildDetailPath(categoryBasePath, result.record.id, null),
      categorySavedNotification,
    );
  }

  if (isCategoryMutationIntent(input.intent)) {
    return withEventBasesFlashNotification(
      currentUrl.pathname,
      categorySavedNotification,
    );
  }

  return plainEventBasesRedirect(currentUrl.pathname);
}

function readCategoryActionInput(
  baseInput: EventBasesActionBaseInput,
  formData: FormData,
): CategoryActionInput {
  return {
    ...baseInput,
    name: String(formData.get("name") ?? ""),
    minAge: Number(formData.get("minAge")),
    maxAge: Number(formData.get("maxAge")),
    groupTypes: formData.getAll("groupTypes").map(String),
    modalityIds: formData.getAll("modalityIds").map(String),
    experienceLevels: formData.getAll("experienceLevels").map(String),
  };
}

function readCategoryActionValues(formData: FormData): CategoryActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    minAge: String(formData.get("minAge") ?? ""),
    maxAge: String(formData.get("maxAge") ?? ""),
    groupTypes: formData.getAll("groupTypes").map(String),
    modalityIds: formData.getAll("modalityIds").map(String),
    experienceLevels: formData.getAll("experienceLevels").map(String),
  };
}

function getCategoryMutationInput(
  input: CategoryActionInput,
): CategoryMutationInput {
  return {
    name: input.name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes: input.groupTypes,
    modalityIds: input.modalityIds,
    experienceLevels: input.experienceLevels,
  };
}

function isCategoryMutationIntent(
  intent: string,
): intent is CategoryMutationIntent {
  return intent === "create-category" || intent === "update-category";
}

async function runCategoryMutation(
  input: CategoryActionInput,
  categoryInput: CategoryMutationInput,
): Promise<EventBasesMutationResult> {
  if (!isCategoryMutationIntent(input.intent)) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "No se pudo interpretar la acción de registro de configuración.",
      fieldErrors: {},
    };
  }

  if (input.intent === "create-category") {
    return createCategory(input.eventId, categoryInput);
  }

  return updateCategory(input.id, categoryInput);
}

async function saveCategory(
  input: CategoryActionInput,
): Promise<EventBasesMutationResult> {
  return runCategoryMutation(input, getCategoryMutationInput(input));
}

import type {
  ActionErrorScope,
  CategoryActionValues,
  EventBasesActionInput,
  EventBasesActionResult,
  EventBasesActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesActionHandler } from "@/lib/admin/events/bases-action/runner.server";
import {
  buildDefaultActionErrorScope,
  buildRecordActionScope,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  withEventBasesNotification,
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

export const categoryActionHandler: EventBasesActionHandler = {
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

export function handlesCategoryIntent(intent: string) {
  return isCategoryMutationIntent(intent) || intent === "delete-category";
}

export function getCategoryConfirmationError(
  _requestUrl: string,
  input: EventBasesActionInput,
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

export function buildCategoryActionErrorScope(
  input: EventBasesActionInput,
): ActionErrorScope | null {
  if (!handlesCategoryIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  return buildRecordActionScope(input.intent, input.id);
}

export function readCategorySubmittedValues(
  input: EventBasesActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (isCategoryMutationIntent(input.intent)) {
    return readCategoryActionValues(formData);
  }

  return undefined;
}

export async function runCategoryIntent(
  input: EventBasesActionInput,
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

export function buildCategoryRedirectUrl(
  requestUrl: string,
  input: EventBasesActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-category") {
    return withEventBasesNotification(
      buildListPath(categoryBasePath, null),
      categoryDeletedNotification,
    );
  }

  if (
    input.intent === "create-category" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildDetailPath(categoryBasePath, result.record.id, null),
      categorySavedNotification,
    );
  }

  if (isCategoryMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      categorySavedNotification,
    );
  }

  return currentUrl.pathname;
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
  input: EventBasesActionInput,
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
  input: EventBasesActionInput,
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
  input: EventBasesActionInput,
): Promise<EventBasesMutationResult> {
  return runCategoryMutation(input, getCategoryMutationInput(input));
}

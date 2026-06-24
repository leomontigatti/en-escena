import {
  buildCategoriasListPath,
  buildCategoryDetailPath,
  isCategoryDetailPath,
} from "@/lib/admin/events/event-bases-navigation";
import { readNameActionValues } from "@/lib/admin/events/bases-action/input.server";
import type {
  ActionErrorScope,
  CategoryActionValues,
  EventBasesActionInput,
  EventBasesActionResult,
  EventBasesActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  buildDefaultActionErrorScope,
  buildRecordActionScope,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  withEventBasesNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createCategory,
  createExperienceLevel,
  deleteCategory,
  deleteExperienceLevel,
  ensureExperienceLevelsForEvent,
  type EventBasesMutationResult,
  updateCategory,
  updateExperienceLevel,
} from "@/lib/events/bases-repository.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";

const categorySavedNotification = "categoria-guardada";
const categoryDeletedNotification = "categoria-eliminada";
const categoryDeleteConfirmationMessage =
  "Confirmá el borrado de la categoría antes de continuar.";

type CategoryMutationIntent = "create-category" | "update-category";
type CategoryMutationInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};

export function handlesCategoryIntent(intent: string) {
  return (
    isCategoryMutationIntent(intent) ||
    intent === "delete-category" ||
    intent === "create-experience-level" ||
    intent === "update-experience-level" ||
    intent === "delete-experience-level"
  );
}

export function getCategoryConfirmationError(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  if (
    input.intent === "delete-category" &&
    isCategoryDetailPath(requestUrl) &&
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

  if (
    input.intent === "create-experience-level" ||
    input.intent === "update-experience-level"
  ) {
    return readNameActionValues(formData);
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
    case "create-experience-level":
      return createExperienceLevel(input.eventId, { name: input.name });
    case "update-experience-level":
      return updateExperienceLevel(input.id, { name: input.name });
    case "delete-experience-level":
      return deleteExperienceLevel(input.id);
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
      buildCategoriasListPath(null),
      categoryDeletedNotification,
    );
  }

  if (
    input.intent === "create-category" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildCategoryDetailPath(result.record.id, null),
      categorySavedNotification,
    );
  }

  if (
    isCategoryMutationIntent(input.intent) ||
    input.intent === "create-experience-level" ||
    input.intent === "update-experience-level" ||
    input.intent === "delete-experience-level"
  ) {
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
    experienceLevelIds: formData.getAll("experienceLevelIds").map(String),
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
    experienceLevelIds: input.experienceLevelIds,
  };
}

function isCategoryMutationIntent(
  intent: string,
): intent is CategoryMutationIntent {
  return intent === "create-category" || intent === "update-category";
}

function appendExperienceLevelId(
  input: CategoryMutationInput,
  experienceLevelId: string,
): CategoryMutationInput {
  return {
    ...input,
    experienceLevelIds: [...input.experienceLevelIds, experienceLevelId],
  };
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
  const fixedExperienceLevelNames =
    input.experienceLevelIds.filter(isExperienceLevel);
  const fixedExperienceLevelIds = await ensureExperienceLevelsForEvent(
    input.eventId,
    fixedExperienceLevelNames,
  );
  const categoryInput = {
    ...getCategoryMutationInput(input),
    experienceLevelIds: [
      ...input.experienceLevelIds.filter(
        (experienceLevelId) => !isExperienceLevel(experienceLevelId),
      ),
      ...fixedExperienceLevelIds,
    ],
  };
  const normalizedNewExperienceLevelName = input.newExperienceLevelName.trim();

  if (!normalizedNewExperienceLevelName) {
    return runCategoryMutation(input, categoryInput);
  }

  const levelResult = await createExperienceLevel(input.eventId, {
    name: normalizedNewExperienceLevelName,
  });

  if (!levelResult.ok) {
    return {
      ...levelResult,
      fieldErrors: {
        ...(levelResult.fieldErrors ?? {}),
        newExperienceLevelName:
          levelResult.fieldErrors?.name ?? levelResult.error,
      },
    };
  }

  const categoryResult = await runCategoryMutation(
    input,
    appendExperienceLevelId(categoryInput, levelResult.record.id),
  );

  if (!categoryResult.ok) {
    await deleteExperienceLevel(levelResult.record.id);
  }

  return categoryResult;
}

import { redirect } from "react-router";

import {
  buildCategoriasListPath,
  buildCategoryDetailPath,
} from "@/components/admin/events/event-categories";
import {
  buildModalidadDetallePath,
  buildModalidadesListPath,
  isModalityDetailPath,
} from "@/components/admin/events/event-modalities";
import {
  buildPriceDetailPath,
  buildPriceListPath,
  isPriceDetailPath,
} from "@/components/admin/events/event-prices";
import {
  buildScheduleBlockDetailPath,
  buildScheduleBlocksPath,
  isScheduleBlockDetailPath,
} from "@/components/admin/events/event-schedule-blocks";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleBlock,
  createScheduleEntry,
  createSubmodality,
  deleteCategory,
  deleteExperienceLevel,
  deleteModality,
  deletePrice,
  deleteScheduleBlock,
  deleteScheduleEntry,
  deleteSubmodality,
  ensureExperienceLevelsForEvent,
  type EventBasesDeleteResult,
  type EventBasesMutationResult,
  type PriceInput,
  type ScheduleBlockInput,
  type ScheduleEntryInput,
  updateCategory,
  updateExperienceLevel,
  updateModality,
  updatePrice,
  updateScheduleBlock,
  updateScheduleEntry,
  updateSubmodality,
} from "@/lib/events/bases-repository.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";

export type ActionData = {
  status: "error";
  message: string;
  fieldErrors: Record<string, string>;
};

type EventBasesActionInput = {
  eventId: string;
  confirmDelete: boolean;
  confirmDeletion: string;
  id: string;
  intent: string;
  capacity: number;
  scheduleBlockId: string;
  priceScheduleBlockId: string | null;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  groupType: string;
  modalityIds: string[];
  modalityId: string;
  newExperienceLevelName: string;
  name: string;
  experienceLevelIds: string[];
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  amount: number;
};

type EventBasesActionResult = EventBasesDeleteResult | EventBasesMutationResult;
type CategoryMutationIntent = "create-category" | "update-category";
type CategoryMutationInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};

const eventBasesNotificationSearchParam = "notificacion";
const categorySavedNotification = "categoria-guardada";
const categoryDeletedNotification = "categoria-eliminada";
const modalitySavedNotification = "modalidad-guardada";
const modalityDeletedNotification = "modalidad-eliminada";
const categoryDeleteConfirmationMessage =
  "Confirmá el borrado de la categoría antes de continuar.";
const scheduleBlockDeleteConfirmationMessage =
  "Confirmá el borrado del bloque horario antes de continuar.";

export async function runEventBasesAction({
  eventId,
  request,
}: {
  eventId: string;
  request: Request;
}) {
  const formData = await request.formData();
  const input = readEventBasesActionInput(eventId, formData);

  if (requiresCategoryDeletionConfirmation(request.url, input)) {
    return actionError(categoryDeleteConfirmationMessage, {
      confirmDelete: categoryDeleteConfirmationMessage,
    });
  }

  if (requiresModalityDeletionConfirmation(request.url, input)) {
    return actionError("Confirmá el borrado de la modalidad.");
  }

  if (requiresPriceDeletionConfirmation(request.url, input)) {
    return actionError("Confirmá el borrado del precio.");
  }

  if (requiresScheduleBlockDeletionConfirmation(request.url, input)) {
    return actionError(scheduleBlockDeleteConfirmationMessage, {
      confirmDelete: scheduleBlockDeleteConfirmationMessage,
    });
  }

  const result = await runEventBasesIntent(input);

  if (!result.ok) {
    return actionError(result.error, result.fieldErrors);
  }

  throw redirect(buildActionRedirectUrl(request.url, eventId, input, result));
}

function isCategoryDetailPath(requestUrl: string) {
  return new RegExp("^/administracion/categorias/[^/]+$").test(
    new URL(requestUrl).pathname,
  );
}

function requiresCategoryDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-category" &&
    isCategoryDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresModalityDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-modality" &&
    isModalityDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresPriceDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-price" &&
    isPriceDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresScheduleBlockDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-schedule-block" &&
    isScheduleBlockDetailPath(requestUrl) &&
    !input.confirmDelete
  );
}

function readEventBasesActionInput(
  eventId: string,
  formData: FormData,
): EventBasesActionInput {
  return {
    confirmDelete:
      String(formData.get("confirmDelete") ?? "") === "1" ||
      String(formData.get("confirmDelete") ?? "") === "on" ||
      String(formData.get("confirmDelete") ?? "") === "yes",
    confirmDeletion: String(formData.get("confirmDeletion") ?? ""),
    eventId,
    capacity: Number.parseInt(String(formData.get("capacity") ?? ""), 10),
    id: String(formData.get("id") ?? ""),
    intent: String(formData.get("intent") ?? ""),
    minAge: Number(formData.get("minAge")),
    maxAge: Number(formData.get("maxAge")),
    groupTypes: formData.getAll("groupTypes").map(String),
    groupType: String(formData.get("groupType") ?? ""),
    modalityIds: formData.getAll("modalityIds").map(String),
    modalityId: String(formData.get("modalityId") ?? ""),
    newExperienceLevelName: String(
      formData.get("newExperienceLevelName") ?? "",
    ),
    name: String(formData.get("name") ?? ""),
    scheduleBlockId: String(formData.get("scheduleBlockId") ?? ""),
    priceScheduleBlockId: String(formData.get("scheduleBlockId") ?? "") || null,
    experienceLevelIds: formData.getAll("experienceLevelIds").map(String),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: Number.parseInt(
      String(formData.get("totalCapacity") ?? ""),
      10,
    ),
    amount: Number.parseInt(String(formData.get("amount") ?? ""), 10),
  };
}

function actionError(
  message: string,
  fieldErrors: Record<string, string> = {},
): ActionData {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

function buildActionRedirectUrl(
  requestUrl: string,
  eventId: string,
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

  if (input.intent === "delete-modality") {
    return withEventBasesNotification(
      buildModalidadesListPath(null),
      modalityDeletedNotification,
    );
  }

  if (input.intent === "delete-price") {
    return withSavedSearch(buildPriceListPath(null), eventId);
  }

  if (input.intent === "delete-schedule-block") {
    return withSavedSearch(buildScheduleBlocksPath(null), eventId);
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
    input.intent === "create-modality" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildModalidadDetallePath(result.record.id, null),
      modalitySavedNotification,
    );
  }

  if (
    input.intent === "create-price" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withSavedSearch(
      buildPriceDetailPath(result.record.id, null),
      eventId,
    );
  }

  if (
    input.intent === "create-schedule-block" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withSavedSearch(
      buildScheduleBlockDetailPath(result.record.id, null),
      eventId,
    );
  }

  if (isModalityMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      modalitySavedNotification,
    );
  }

  if (isCategoryMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      categorySavedNotification,
    );
  }

  return withSavedSearch(currentUrl.pathname, eventId);
}

function withSavedSearch(pathname: string, _eventId: string) {
  const redirectUrl = new URL(`http://localhost${pathname}`);
  redirectUrl.searchParams.set("guardado", "1");

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

function withEventBasesNotification(pathname: string, notification: string) {
  const redirectUrl = new URL(`http://localhost${pathname}`);
  redirectUrl.searchParams.set(eventBasesNotificationSearchParam, notification);

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

function isModalityMutationIntent(intent: string) {
  return (
    intent === "update-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality"
  );
}

function hasEventBaseRecord(
  result: EventBasesActionResult,
): result is Extract<EventBasesMutationResult, { ok: true }> {
  return "record" in result;
}

async function runEventBasesIntent(
  input: EventBasesActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-category":
      return saveCategory(input);
    case "update-category":
      return saveCategory(input);
    case "delete-category":
      if (!input.confirmDelete && input.confirmDeletion !== input.id) {
        return {
          ok: false as const,
          code: "invalid-event-bases" as const,
          error: categoryDeleteConfirmationMessage,
          fieldErrors: {
            confirmDelete: categoryDeleteConfirmationMessage,
          },
        };
      }
      return deleteCategory(input.id);
    case "create-schedule-block":
      return createScheduleBlock(input.eventId, getScheduleBlockInput(input));
    case "update-schedule-block":
      return updateScheduleBlock(input.id, getScheduleBlockInput(input));
    case "delete-schedule-block":
      return deleteScheduleBlock(input.id);
    case "create-price":
      return createPrice(input.eventId, getPriceInput(input));
    case "update-price":
      return updatePrice(input.id, getPriceInput(input));
    case "delete-price":
      return deletePrice(input.id);
    case "create-schedule-entry":
      return createScheduleEntry(
        input.scheduleBlockId,
        getScheduleEntryInput(input),
      );
    case "update-schedule-entry":
      return updateScheduleEntry(input.id, getScheduleEntryInput(input));
    case "delete-schedule-entry":
      return deleteScheduleEntry(input.id);
    case "create-modality":
      return createModality(input.eventId, { name: input.name });
    case "update-modality":
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
    case "create-experience-level":
      return createExperienceLevel(input.eventId, { name: input.name });
    case "update-experience-level":
      return updateExperienceLevel(input.id, { name: input.name });
    case "delete-experience-level":
      return deleteExperienceLevel(input.id);
    default:
      return {
        ok: false as const,
        code: "invalid-event-bases" as const,
        error: "No se pudo interpretar la acción de registro de configuración.",
        fieldErrors: {},
      };
  }
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

function getScheduleBlockInput(
  input: EventBasesActionInput,
): ScheduleBlockInput {
  return {
    name: input.name,
    scheduledDate: input.scheduledDate,
    startTime: input.startTime,
    totalCapacity: input.totalCapacity,
    modalityIds: input.modalityIds,
  };
}

function getPriceInput(input: EventBasesActionInput): PriceInput {
  return {
    name: input.name,
    groupType: input.groupType,
    amount: input.amount,
    scheduleBlockId: input.priceScheduleBlockId,
  };
}

function getScheduleEntryInput(
  input: EventBasesActionInput,
): ScheduleEntryInput {
  return {
    groupTypes: input.groupTypes,
    capacity: input.capacity,
  };
}

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, modalities } from "@/db/schema";
import {
  validateExperienceLevelSelection,
  validateSubmodalitySelection,
} from "@/lib/choreographies/registration-resolution.server";
import {
  guardAndLockScheduleCapacityMove,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import {
  getEventBases,
  resolveEventBasesScheduleModalityIds,
  resolveEventBasesCorrectableScheduleIds,
} from "@/lib/events/bases.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";
import { loadPriceDivergenceCheck } from "@/lib/finances/choreography-frozen-price-guard.server";

import {
  frozenPriceModalityMessage,
  resolveModalityCorrectionContext,
  toMissingScheduleMessage,
} from "./modality-resolution.server";
import type { ChoreographyDetail } from "./server";
import {
  choreographySavedSuccess,
  modalityFieldNames,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyModalityBlocker,
  type ChoreographySuccessData,
} from "./shared";

export type ChoreographyModalityOption = {
  /**
   * Whether any schedule of the event accepts this modality. `false` is a
   * structural dead end: the correction would leave the choreography with no
   * schedule, and `findChoreographyDetail` innerJoins it, so the detail view
   * would 404 out from under the administrator.
   */
  hasCompatibleScheduleCapacity: boolean;
  id: string;
  name: string;
};

export type ChoreographyModalityResolution = {
  category: { id: string; name: string } | null;
  experienceLevel: {
    options: Array<{ id: string; name: string }>;
    required: boolean;
  };
  modalityId: string;
  scheduleCapacity: {
    options: ScheduleCapacitySelectOption[];
    status: "auto" | "multiple" | "none";
  };
  submodality: {
    options: Array<{ id: string; name: string }>;
    required: boolean;
  };
};

export type ChoreographyModalityResolutionResult =
  | { ok: true; resolution: ChoreographyModalityResolution }
  | { ok: false; message: string };

const presentationLockMessage =
  "No se puede cambiar la modalidad: la coreografía ya tiene presentación.";

const invalidModalityMessage = "Elegí una modalidad válida del evento activo.";

const incompatibleModalityMessage =
  "No se puede cambiar la modalidad: ningún cronograma del evento acepta esa modalidad.";

const divergedResolutionMessage =
  "La resolución cambió mientras corregías la modalidad. Revisá los campos y volvé a guardar.";

/**
 * The price is reported as a blocker-in-waiting, not as a closed field: a
 * destination modality whose capacity holds the price is saved like any other.
 * It is enumerated for the `auditor` too.
 *
 * Phrased around the price and not around the schedule moving, which is what
 * keeps it from reading as a second copy of the capacity alert: the schedule
 * moving is no longer what the save refuses, the price changing is.
 */
const priceChangeBlocker: ChoreographyModalityBlocker = {
  code: "price-change",
  label:
    "Solo se puede corregir la modalidad si el cronograma no cambia de precio: hay inscripciones con dinero asignado.",
};

/**
 * Whether any correction could land on a schedule that reprices a
 * money-holding inscription — asked of every schedule some modality of the
 * event accepts, not of the ones the current modality accepts, because the
 * correction is precisely what changes which modality's schedules are in play.
 *
 * Money alone is not the question any more: a choreography whose inscriptions
 * are all frozen against general rows can be corrected into any modality
 * without a peso moving, and announcing a caveat there is announcing nothing.
 */
export async function listChoreographyModalityBlockers(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<ChoreographyModalityBlocker[]> {
  const [scheduleIds, diverges] = await Promise.all([
    resolveEventBasesCorrectableScheduleIds(input.eventId),
    loadPriceDivergenceCheck({
      choreographyId: input.choreography.id,
      executor: db,
    }),
  ]);
  const hasPriceDivergentSchedule = scheduleIds.some((scheduleId) =>
    diverges({
      // Modality is not part of the price key: the correction moves the
      // schedule alone and keeps the group type the roster gives.
      groupType: input.choreography.groupType,
      scheduleId,
    }),
  );

  return hasPriceDivergentSchedule ? [priceChangeBlocker] : [];
}

/**
 * Every modality of the event, current one included, each carrying whether a
 * schedule can take it. The options the view offers are exactly the ones the
 * intent accepts, and the ones it renders disabled are exactly the ones the
 * intent rejects.
 */
export async function listChoreographyModalityOptions(
  eventId: string,
): Promise<ChoreographyModalityOption[]> {
  const [modalityRows, scheduledModalityIds] = await Promise.all([
    db
      .select({ id: modalities.id, name: modalities.name })
      .from(modalities)
      .where(eq(modalities.eventId, eventId))
      .orderBy(asc(modalities.name)),
    resolveEventBasesScheduleModalityIds(eventId),
  ]);
  const scheduled = new Set(scheduledModalityIds);

  return modalityRows.map((modality) => ({
    hasCompatibleScheduleCapacity: scheduled.has(modality.id),
    id: modality.id,
    name: modality.name,
  }));
}

/**
 * What the choreography would look like under a candidate modality, without
 * writing anything: the resolved category, whether a submodality and a level
 * are now required, and the compatible capacities. The `Guardar` re-resolves the
 * same way before opening its transaction and rejects on divergence, because
 * this answer is older than the write by construction.
 */
export async function resolveChoreographyModalityCorrection(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  modalityId: string;
}): Promise<ChoreographyModalityResolutionResult> {
  const eventBases = await getEventBases(input.eventId);

  if (!eventBases.modalities.some(({ id }) => id === input.modalityId)) {
    return { ok: false, message: invalidModalityMessage };
  }

  const context = await resolveModalityCorrectionContext({
    choreography: input.choreography,
    eventBases,
    eventId: input.eventId,
    modalityId: input.modalityId,
  });
  const category = context.classification.category;

  return {
    ok: true,
    resolution: {
      category:
        category.status === "resolved"
          ? { id: category.id, name: category.name }
          : null,
      experienceLevel: {
        options: context.classification.experienceLevel.options,
        required: context.classification.experienceLevel.required,
      },
      modalityId: input.modalityId,
      scheduleCapacity: {
        options: context.scheduleOptions.map((option) => ({
          id: option.id,
          isFull: option.isFull,
          label: option.label,
        })),
        status: context.scheduleStatus,
      },
      submodality: {
        options: context.submodalityOptions,
        required: context.submodalityOptions.length > 0,
      },
    },
  };
}

/**
 * The compound correction: modality, submodality, category, level and schedule
 * capacity are written together or not at all. Nothing in the database
 * holds the three belongs-to invariants this write can break —submodality
 * within its modality, category through `category_modality`, modality inside
 * the schedule's modalities— so this transaction is the only thing behind
 * them.
 */
export async function updateChoreographyModality(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // Same hard lock as the roster, the capacity and the deletion. It also covers the
  // scores: a score belongs to a judge assignment on a presentation, so
  // there is no scored choreography without one.
  if (input.choreography.hasPresentation) {
    return { message: presentationLockMessage, status: "error" };
  }

  const requestedModalityId = readNonEmptyFormValue(
    input.formData,
    modalityFieldNames.modalityId,
  );

  if (requestedModalityId === null) {
    return { message: invalidModalityMessage, status: "error" };
  }

  // Re-selecting the modality it already has is a successful no-op, like
  // re-selecting the current capacity. It also covers drift: a current modality
  // that lost its schedule still renders selected, and confirming it must not
  // be reported as an incompatible choice.
  if (requestedModalityId === input.choreography.modalityId) {
    return choreographySavedSuccess();
  }

  const options = await listChoreographyModalityOptions(input.eventId);
  const selectedModality = options.find(
    (option) => option.id === requestedModalityId,
  );

  if (!selectedModality) {
    return { message: invalidModalityMessage, status: "error" };
  }

  if (!selectedModality.hasCompatibleScheduleCapacity) {
    return { message: incompatibleModalityMessage, status: "error" };
  }

  // The correction is re-resolved here and not read back from the form: the
  // fetcher's preview is older than this write by construction, and a category
  // resolved against bases that have moved since would be written against the
  // new ones. It runs immediately before the transaction rather than inside it
  // because the shared resolvers own their own executor; what the transaction
  // adds is the lock, which is the part that races.
  const eventBases = await getEventBases(input.eventId);
  const context = await resolveModalityCorrectionContext({
    choreography: input.choreography,
    eventBases,
    eventId: input.eventId,
    modalityId: selectedModality.id,
  });
  const category = context.classification.category;
  const resolvedCategoryId =
    category.status === "resolved" ? category.id : null;

  if (
    resolvedCategoryId !==
    readNonEmptyFormValue(
      input.formData,
      modalityFieldNames.previewedCategoryId,
    )
  ) {
    return { message: divergedResolutionMessage, status: "error" };
  }

  const submodalityId = readNonEmptyFormValue(
    input.formData,
    modalityFieldNames.submodalityId,
  );
  const submodalityValidation = validateSubmodalitySelection({
    availableSubmodalities: context.submodalityOptions,
    submodalityId,
  });

  if (!submodalityValidation.ok) {
    return { message: submodalityValidation.failure.error, status: "error" };
  }

  const experienceLevelOptions = context.classification.experienceLevel.required
    ? context.classification.experienceLevel.options
    : [];
  // The level is dropped rather than carried over when the resolved category
  // declares none: `experience_level` is meaningless outside the category that
  // admits it.
  const experienceLevelId =
    experienceLevelOptions.length > 0
      ? readNonEmptyFormValue(
          input.formData,
          modalityFieldNames.experienceLevelId,
        )
      : null;
  const experienceLevelValidation = validateExperienceLevelSelection({
    availableExperienceLevels: experienceLevelOptions,
    experienceLevelId,
  });

  if (!experienceLevelValidation.ok) {
    return {
      message: experienceLevelValidation.failure.error,
      status: "error",
    };
  }

  const requestedScheduleOptionId = readNonEmptyFormValue(
    input.formData,
    modalityFieldNames.scheduleCapacityId,
  );
  const selectedSchedule = context.scheduleOptions.find(
    (option) => option.id === requestedScheduleOptionId,
  );

  if (!selectedSchedule) {
    return {
      message: toMissingScheduleMessage({
        context,
        requestedScheduleOptionId,
      }),
      status: "error",
    };
  }

  const result = await db.transaction(async (tx) => {
    // The money guard fires only when the correction would actually move the
    // price key. A destination modality that lands on the capacity the
    // choreography already occupies is financially inert, and those corrections
    // stay available on a choreography that holds money; the capacity is still
    // locked and re-counted, excluding this choreography, so a full destination
    // is rejected either way.
    const movesScheduleCapacity =
      selectedSchedule.id !== input.choreography.scheduleCapacityId;
    const move = movesScheduleCapacity
      ? await guardAndLockScheduleCapacityMove({
          choreographyId: input.choreography.id,
          // Modality is not part of the price key, so the correction moves the
          // schedule alone and keeps the choreography's group type.
          destinationGroupType: input.choreography.groupType,
          scheduleCapacityId: selectedSchedule.scheduleCapacityId,
          scheduleId: selectedSchedule.scheduleId,
          tx,
        })
      : await lockScheduleCapacityForAssignment({
          excludeChoreographyId: input.choreography.id,
          scheduleCapacityId: selectedSchedule.scheduleCapacityId,
          scheduleId: selectedSchedule.scheduleId,
          tx,
        });

    if (!move.ok) {
      return {
        error:
          move.code === "frozen-price"
            ? frozenPriceModalityMessage
            : move.error,
        ok: false as const,
      };
    }

    await tx
      .update(choreographies)
      .set({
        categoryAgeBasis: context.classification.categoryAgeBasis,
        categoryCalculationMode: context.classification.categoryCalculationMode,
        categoryId: resolvedCategoryId,
        experienceLevelId:
          experienceLevelId !== null && isExperienceLevel(experienceLevelId)
            ? experienceLevelId
            : null,
        modalityId: selectedModality.id,
        scheduleCapacityId: move.scheduleCapacityId,
        scheduleId: move.scheduleId,
        submodalityId,
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, input.choreography.id));

    return { ok: true as const };
  });

  if (!result.ok) {
    return { message: result.error, status: "error" };
  }

  return choreographySavedSuccess();
}

/**
 * `null` for both an absent field and an empty one: every id this correction
 * reads is either a real choice or nothing, and the empty string is how an
 * unanswered select arrives. Distinct from the `readFormString` of the sibling
 * actions, which keeps `""` because their fields are optional text.
 */
function readNonEmptyFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

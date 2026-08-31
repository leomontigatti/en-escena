import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, modalities } from "@/db/schema";
import {
  resolveChoreographyClassificationForResolvedDancers,
  validateExperienceLevelSelection,
  validateSubmodalitySelection,
} from "@/lib/choreographies/registration-resolution.server";
import {
  guardAndLockScheduleCapacityMove,
  invalidScheduleEntryMessage,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  getEventBases,
  resolveEventBasesScheduleModalityIds,
  resolveEventBasesScheduleOptions,
} from "@/lib/events/bases.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";

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
   * Whether any cronograma of the event accepts this modalidad. `false` is a
   * structural dead end: the correction would leave the choreography with no
   * cronograma, and `findChoreographyDetail` innerJoins it, so the detail view
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

type ResolvedModalityScheduleOption = ScheduleCapacitySelectOption & {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

type ModalityCorrectionContext = {
  classification: ReturnType<
    typeof resolveChoreographyClassificationForResolvedDancers
  >;
  scheduleOptions: ResolvedModalityScheduleOption[];
  scheduleStatus: "auto" | "multiple" | "none";
  submodalityOptions: Array<{ id: string; name: string }>;
};

const presentationLockMessage =
  "No se puede cambiar la modalidad: la coreografía ya tiene presentación.";

const invalidModalityMessage = "Elegí una modalidad válida del evento activo.";

const incompatibleModalityMessage =
  "No se puede cambiar la modalidad: ningún cronograma del evento acepta esa modalidad.";

const divergedResolutionMessage =
  "La resolución cambió mientras corregías la modalidad. Revisá los campos y volvé a guardar.";

/**
 * The seña rejection names the modalidad instead of reusing
 * `frozenPriceScheduleCapacityMessage`, which names the cupo: the administrator
 * did not touch the cupo select here, and pointing at it would send them to the
 * wrong field.
 */
const frozenPriceModalityMessage =
  "No se puede cambiar la modalidad: el cronograma se movería y hay inscripciones con dinero asignado.";

/**
 * The seña is reported as a blocker-in-waiting, not as a closed field: a
 * destination modalidad that keeps the current cronograma is financially inert
 * and stays available. It is enumerated for the `auditor` too.
 */
const frozenPriceBlocker: ChoreographyModalityBlocker = {
  code: "frozen-price",
  label:
    "Al menos una inscripción tiene dinero asignado: solo se puede corregir la modalidad si el cronograma no se mueve.",
};

export function toChoreographyModalityBlockers(
  hasFrozenPrice: boolean,
): ChoreographyModalityBlocker[] {
  return hasFrozenPrice ? [frozenPriceBlocker] : [];
}

/**
 * Every modalidad of the event, current one included, each carrying whether a
 * cronograma can take it. The options the view offers are exactly the ones the
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
 * What the choreography would look like under a candidate modalidad, without
 * writing anything: the resolved categoría, whether a submodalidad and a nivel
 * are now required, and the compatible cupos. The `Guardar` re-resolves the
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
 * The compound correction: modalidad, submodalidad, categoría, nivel and cupo
 * de cronograma are written together or not at all. Nothing in the database
 * holds the three belongs-to invariants this write can break —submodalidad
 * within its modalidad, categoría through `category_modality`, modalidad inside
 * the cronograma's modalidades— so this transaction is the only thing behind
 * them.
 */
export async function updateChoreographyModality(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // Same hard lock as the roster, the cupo and the deletion. It also covers the
  // puntajes: a Puntaje belongs to a judge assignment on a presentación, so
  // there is no scored choreography without one.
  if (input.choreography.hasPresentation) {
    return { message: presentationLockMessage, status: "error" };
  }

  const requestedModalityId = readFormValue(
    input.formData,
    modalityFieldNames.modalityId,
  );

  if (requestedModalityId === null) {
    return { message: invalidModalityMessage, status: "error" };
  }

  // Re-selecting the modalidad it already has is a successful no-op, like
  // re-selecting the current cupo. It also covers drift: a current modalidad
  // that lost its cronograma still renders selected, and confirming it must not
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
  // fetcher's preview is older than this write by construction, and a categoría
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
    readFormValue(input.formData, modalityFieldNames.previewedCategoryId)
  ) {
    return { message: divergedResolutionMessage, status: "error" };
  }

  const submodalityId = readFormValue(
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
  // The nivel is dropped rather than carried over when the resolved categoría
  // declares none: `experience_level` is meaningless outside the categoría that
  // admits it.
  const experienceLevelId =
    experienceLevelOptions.length > 0
      ? readFormValue(input.formData, modalityFieldNames.experienceLevelId)
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

  const selectedSchedule = context.scheduleOptions.find(
    (option) =>
      option.id ===
      readFormValue(input.formData, modalityFieldNames.scheduleCapacityId),
  );

  if (!selectedSchedule) {
    return { message: invalidScheduleEntryMessage, status: "error" };
  }

  const result = await db.transaction(async (tx) => {
    // The money guard fires only when the correction would actually move the
    // price key. A destination modalidad that lands on the cupo the
    // choreography already occupies is financially inert, and those corrections
    // stay available on a choreography that holds money; the cupo is still
    // locked and re-counted, excluding this choreography, so a full destination
    // is rejected either way.
    const movesScheduleCapacity =
      selectedSchedule.id !== input.choreography.scheduleCapacityId;
    const move = movesScheduleCapacity
      ? await guardAndLockScheduleCapacityMove({
          choreographyId: input.choreography.id,
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

async function resolveModalityCorrectionContext(input: {
  choreography: ChoreographyDetail;
  eventBases: Awaited<ReturnType<typeof getEventBases>>;
  eventId: string;
  modalityId: string;
}): Promise<ModalityCorrectionContext> {
  const classification = resolveChoreographyClassificationForResolvedDancers({
    dancers: input.choreography.dancers,
    eventBases: input.eventBases,
    modalityId: input.modalityId,
  });
  const scheduleResolution = await resolveEventBasesScheduleOptions({
    eventId: input.eventId,
    groupType: classification.groupType,
    modalityId: input.modalityId,
  });

  return {
    classification,
    scheduleOptions: await withScheduleCapacityOccupancy({
      // Same exclusion as the lock: the choreography being corrected does not
      // count against the cupo it already occupies.
      excludeChoreographyId: input.choreography.id,
      options: scheduleResolution.options.map((option) => ({
        id: option.id,
        label: formatScheduleDateTime(option.schedule),
        scheduleCapacityId: option.scheduleCapacityId,
        scheduleId: option.scheduleId,
      })),
    }),
    scheduleStatus: scheduleResolution.status,
    submodalityOptions: input.eventBases.submodalities
      .filter((submodality) => submodality.modalityId === input.modalityId)
      .map((submodality) => ({ id: submodality.id, name: submodality.name })),
  };
}

function readFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

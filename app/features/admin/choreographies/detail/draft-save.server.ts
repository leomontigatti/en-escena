import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { evaluatedChoreographyMessage } from "@/lib/choreographies/choreography-messages";
import { syncRosterInscriptions } from "@/lib/choreographies/choreography-roster-admin.server";
import {
  validateChoreographyProfessorSelection,
  writeChoreographyProfessors,
} from "@/lib/choreographies/choreography-roster-professor-update.server";
import {
  compatibleScheduleSelectionRequiredMessage,
  getGlobalScheduleCapacityOptionId,
} from "@/lib/choreographies/choreography-roster.shared";
import { normalizeActiveInscriptionAges } from "@/lib/choreographies/inscription-age.server";
import {
  validateExperienceLevelSelection,
  validateSubmodalitySelection,
} from "@/lib/choreographies/registration-resolution.server";
import {
  guardAndLockScheduleCapacityMove,
  lockScheduleAcceptance,
  priceDivergenceScheduleCapacityMessage,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  isExperienceLevel,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import { hasEvaluatedPresentation } from "@/lib/presentations/evaluation-lock.server";

import type { ChoreographyDetail } from "./choreography-queries.server";
import {
  resolveChoreographyDraft,
  type ChoreographyDraftResolution,
} from "./draft-resolution.server";
import type { DraftScheduleOption } from "./draft-schedule.server";
import {
  readChoreographyDraftFormData,
  type ChoreographyDraft,
} from "./draft.shared";
import {
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographySuccessData,
} from "./shared";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const missingNameMessage = "Ingresá el nombre de la coreografía.";

const divergedResolutionMessage =
  "La resolución cambió mientras editabas la coreografía. Revisá los campos y volvé a guardar.";

type Refusal = { ok: false; message: string };

/** What the save writes, settled before its transaction opens. */
type DraftWrite = {
  experienceLevelId: ExperienceLevel | null;
  move: DraftScheduleOption | null;
  name: string;
  professionalEvaluation: boolean;
  resolution: ChoreographyDraftResolution;
  submodalityId: string | null;
};

/**
 * Saves the whole draft of the detail in one transaction, or nothing. It
 * re-resolves the draft rather than trusting the preview, which is older than
 * the write by construction, and refuses when the category it lands on is not
 * the one the administrator was shown.
 */
export async function saveChoreographyDraft(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  const { draft, previewedCategoryId } = readChoreographyDraftFormData(
    input.formData,
  );
  const resolution = await resolveChoreographyDraft({
    choreography: input.choreography,
    draft,
    eventId: input.eventId,
  });
  const plan = await planDraftWrite({
    choreography: input.choreography,
    draft,
    previewedCategoryId,
    resolution,
  });

  if (!plan.ok) {
    return { message: plan.message, status: "error" };
  }

  const result = await db.transaction((tx) =>
    writeDraft({ choreography: input.choreography, draft, tx, write: plan }),
  );

  if (!result.ok) {
    return { message: result.message, status: "error" };
  }

  return choreographySavedSuccess();
}

/**
 * Every refusal that reads nothing under a lock, so the transaction is left
 * with nothing to decide but what the locks answer.
 */
async function planDraftWrite(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  previewedCategoryId: string | null;
  resolution: ChoreographyDraftResolution;
}): Promise<({ ok: true } & DraftWrite) | Refusal> {
  const name = input.draft.name.trim();
  const refusal = findDraftRefusal({ ...input, name });

  if (refusal) {
    return refusal;
  }

  const submodalityId = readSubmodalityId(input);
  const experienceLevelId = readExperienceLevelId(input);
  const move = readScheduleMove(input);
  const professors = await validateDraftProfessors(input);

  for (const piece of [submodalityId, experienceLevelId, move, professors]) {
    if (!piece.ok) {
      return piece;
    }
  }

  return {
    experienceLevelId: experienceLevelId.ok ? experienceLevelId.value : null,
    move: move.ok ? move.value : null,
    name,
    ok: true,
    professionalEvaluation: input.draft.professionalEvaluation,
    resolution: input.resolution,
    submodalityId: submodalityId.ok ? submodalityId.value : null,
  };
}

/**
 * The refusals that belong to the draft as a whole: a missing name, a
 * structural edit on an evaluated choreography, a blocker the resolution
 * reported, and a preview the resolution no longer agrees with.
 */
function findDraftRefusal(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  name: string;
  previewedCategoryId: string | null;
  resolution: ChoreographyDraftResolution;
}): Refusal | null {
  const { preview } = input.resolution;
  const [blocker] = preview.blockers;

  if (input.name.length === 0) {
    return refuse(missingNameMessage);
  }

  if (
    preview.structuralLock &&
    isStructuralDraft(input.choreography, input.draft, input.resolution)
  ) {
    return refuse(preview.structuralLock);
  }

  if (blocker) {
    return refuse(blocker.message);
  }

  if (
    input.resolution.changes.classification &&
    preview.category?.id !== input.previewedCategoryId
  ) {
    return refuse(divergedResolutionMessage);
  }

  return null;
}

function isStructuralDraft(
  choreography: ChoreographyDetail,
  draft: ChoreographyDraft,
  resolution: ChoreographyDraftResolution,
) {
  return (
    resolution.changes.classification ||
    resolution.changes.professors ||
    toNullable(draft.submodalityId) !== choreography.submodalityId ||
    toNullable(draft.experienceLevelId) !== choreography.experienceLevelId ||
    // The judges read it off the heading, so it is settled once they scored.
    draft.professionalEvaluation !== choreography.professionalEvaluation ||
    draft.scheduleCapacityId !== choreography.scheduleCapacityId
  );
}

/**
 * Re-chosen whenever the modality changes, never carried over: nothing ties
 * the column back to its modality, and a submodality of another modality is
 * invisible in every list.
 */
function readSubmodalityId(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  resolution: ChoreographyDraftResolution;
}): { ok: true; value: string | null } | Refusal {
  const submodalityId = toNullable(input.draft.submodalityId);

  if (
    !input.resolution.changes.modality &&
    submodalityId === input.choreography.submodalityId
  ) {
    return { ok: true, value: submodalityId };
  }

  const validation = validateSubmodalitySelection({
    availableSubmodalities: input.resolution.preview.submodality.options,
    submodalityId,
  });

  return validation.ok
    ? { ok: true, value: submodalityId }
    : refuse(validation.failure.error);
}

/**
 * The saved level stands while neither it nor the placement moved. Otherwise
 * it has to be one the resolved category admits, and it is required when the
 * category declares any.
 */
function readExperienceLevelId(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  resolution: ChoreographyDraftResolution;
}): { ok: true; value: ExperienceLevel | null } | Refusal {
  const experienceLevelId = toNullable(input.draft.experienceLevelId);

  if (
    !input.resolution.changes.classification &&
    experienceLevelId === input.choreography.experienceLevelId
  ) {
    return {
      ok: true,
      value:
        experienceLevelId !== null && isExperienceLevel(experienceLevelId)
          ? experienceLevelId
          : null,
    };
  }

  const { options, required } = input.resolution.preview.experienceLevel;
  const validation = validateExperienceLevelSelection({
    availableExperienceLevels: required ? options : [],
    experienceLevelId,
  });

  if (!validation.ok) {
    return refuse(validation.failure.error);
  }

  return {
    ok: true,
    value:
      experienceLevelId !== null && isExperienceLevel(experienceLevelId)
        ? experienceLevelId
        : null,
  };
}

/**
 * The capacity the draft names has to be one the resolution offers. One the
 * price filter left out is refused for its price, with the same sentence
 * whether the modality, the dancers or the select is what moved it.
 */
function readScheduleMove(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  resolution: ChoreographyDraftResolution;
}): { ok: true; value: DraftScheduleOption | null } | Refusal {
  const { schedule } = input.resolution;
  const option = schedule.options.find(
    (candidate) => candidate.id === input.draft.scheduleCapacityId,
  );

  if (!option) {
    return refuse(
      schedule.priceDivergentIds.includes(input.draft.scheduleCapacityId)
        ? priceDivergenceScheduleCapacityMessage
        : compatibleScheduleSelectionRequiredMessage,
    );
  }

  return {
    ok: true,
    value: option.id === input.choreography.scheduleCapacityId ? null : option,
  };
}

async function validateDraftProfessors(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  resolution: ChoreographyDraftResolution;
}): Promise<{ ok: true } | Refusal> {
  if (!input.resolution.changes.professors) {
    return { ok: true };
  }

  const validation = await validateChoreographyProfessorSelection({
    academyId: input.choreography.academyId,
    choreographyId: input.choreography.id,
    professorIds: input.draft.professorIds,
  });

  return validation.ok ? { ok: true } : refuse(validation.message);
}

/** Whether the locked row no longer holds what the save was decided on. */
function isStale(
  choreography: ChoreographyDetail,
  locked: {
    categoryId: string;
    modalityId: string;
    professionalEvaluation: boolean;
    scheduleCapacityId: string | null;
    scheduleId: string;
  },
) {
  return (
    locked.categoryId !== choreography.categoryId ||
    locked.modalityId !== choreography.modalityId ||
    // The academy writes it too, from the portal: a save decided on the old
    // answer must not put it back, nor slip a change past the evaluation check.
    locked.professionalEvaluation !== choreography.professionalEvaluation ||
    locked.scheduleId !== choreography.scheduleId ||
    (locked.scheduleCapacityId ??
      getGlobalScheduleCapacityOptionId(locked.scheduleId)) !==
      choreography.scheduleCapacityId
  );
}

/**
 * The write itself, under the choreography's row lock. The schedule is locked
 * before anything is written, so a refusal from the lock leaves no piece of
 * the draft behind.
 */
async function writeDraft(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  tx: Transaction;
  write: DraftWrite;
}): Promise<{ ok: true } | Refusal> {
  const { choreography, draft, tx, write } = input;

  const [locked] = await tx
    .select({
      categoryId: choreographies.categoryId,
      modalityId: choreographies.modalityId,
      professionalEvaluation: choreographies.professionalEvaluation,
      scheduleCapacityId: choreographies.scheduleCapacityId,
      scheduleId: choreographies.scheduleId,
    })
    .from(choreographies)
    .where(eq(choreographies.id, choreography.id))
    .for("update");

  // The choreography was read before the lock: what the decisions below were
  // made on must still be what is stored.
  if (!locked || isStale(choreography, locked)) {
    return refuse(divergedResolutionMessage);
  }

  if (
    isStructuralDraft(choreography, draft, write.resolution) &&
    (await hasEvaluatedPresentation(choreography.id, tx))
  ) {
    return refuse(evaluatedChoreographyMessage);
  }

  const placement = await lockDraftPlacement(input);

  if (!placement.ok) {
    return placement;
  }

  await writeDraftPeople(input);
  await tx
    .update(choreographies)
    .set({
      experienceLevelId: write.experienceLevelId,
      name: write.name,
      professionalEvaluation: write.professionalEvaluation,
      submodalityId: write.submodalityId,
      updatedAt: new Date(),
      ...toPlacementColumns(write, draft),
      ...(placement.schedule ?? {}),
    })
    .where(eq(choreographies.id, choreography.id));

  return { ok: true };
}

/**
 * The inscriptions and the professor links. A roster that was re-resolved is
 * synced; one that was not still leaves no active inscription with a stale age
 * (#1050), and writes no placement doing it. Once evaluated, the stored ages
 * are what the dancers competed with, and stay.
 */
async function writeDraftPeople(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  tx: Transaction;
  write: DraftWrite;
}) {
  const { choreography, draft, tx, write } = input;
  const { changes, preview, resolvedDancers } = write.resolution;

  if (changes.classification) {
    await syncRosterInscriptions({
      choreographyId: choreography.id,
      requestedDancerIds: new Set(draft.dancerIds),
      resolvedDancers,
      tx,
    });
  } else if (preview.structuralLock === null) {
    await normalizeActiveInscriptionAges(tx, {
      choreographyId: choreography.id,
    });
  }

  if (changes.professors) {
    await writeChoreographyProfessors(tx, {
      choreographyId: choreography.id,
      professorIds: [...new Set(draft.professorIds)],
    });
  }
}

/** The placement columns, written only when the draft re-resolved them. */
function toPlacementColumns(write: DraftWrite, draft: ChoreographyDraft) {
  const { classification } = write.resolution;

  if (!classification?.categoryId) {
    return {};
  }

  return {
    categoryAgeBasis: classification.categoryAgeBasis,
    categoryCalculationMode: classification.categoryCalculationMode,
    categoryId: classification.categoryId,
    groupType: classification.groupType,
    modalityId: draft.modalityId,
  };
}

/**
 * The shared guard-then-lock pair when the draft moves the schedule or its
 * capacity, whatever field moved it: the money question is asked against the
 * destination price key, group type included. Staying on the same slot counts
 * no place, but a new modality or category still has to be one the schedule
 * accepts when this commits. A group type change alone asks neither.
 */
async function lockDraftPlacement(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  tx: Transaction;
  write: DraftWrite;
}): Promise<
  | {
      ok: true;
      schedule: {
        scheduleCapacityId: string | null;
        scheduleId: string;
      } | null;
    }
  | Refusal
> {
  const { choreography, draft, tx, write } = input;
  const { classification } = write.resolution;
  const accepts = {
    categoryId: classification?.categoryId ?? choreography.categoryId,
    modalityId: draft.modalityId,
  };

  if (write.move) {
    return await lockDraftMove({
      accepts,
      choreographyId: choreography.id,
      destination: write.move,
      groupType: classification?.groupType ?? choreography.groupType,
      tx,
    });
  }

  const staysAccepted =
    accepts.modalityId === choreography.modalityId &&
    accepts.categoryId === choreography.categoryId;
  const acceptance = staysAccepted
    ? { ok: true as const }
    : await lockScheduleAcceptance({
        accepts,
        scheduleId: choreography.scheduleId,
        tx,
      });

  return acceptance.ok
    ? { ok: true, schedule: null }
    : refuse(compatibleScheduleSelectionRequiredMessage);
}

async function lockDraftMove(input: {
  accepts: { categoryId: string; modalityId: string };
  choreographyId: string;
  destination: DraftScheduleOption;
  groupType: ChoreographyDetail["groupType"];
  tx: Transaction;
}) {
  const move = await guardAndLockScheduleCapacityMove({
    accepts: input.accepts,
    choreographyId: input.choreographyId,
    destinationGroupType: input.groupType,
    scheduleCapacityId: input.destination.scheduleCapacityId,
    scheduleId: input.destination.scheduleId,
    tx: input.tx,
  });

  if (!move.ok) {
    return refuse(
      "incompatibility" in move
        ? compatibleScheduleSelectionRequiredMessage
        : move.error,
    );
  }

  return {
    ok: true as const,
    schedule: {
      scheduleCapacityId: move.scheduleCapacityId,
      scheduleId: move.scheduleId,
    },
  };
}

function refuse(message: string): Refusal {
  return { message, ok: false };
}

function toNullable(value: string) {
  return value.length > 0 ? value : null;
}

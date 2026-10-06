import { z } from "zod";

import { haveSameIds } from "@/lib/choreographies/choreography-roster.shared";
import { requiredFieldMessage } from "@/lib/shared/forms";

import type { ChoreographyDetail } from "./choreography-queries.server";
import type {
  ChoreographyDraft,
  ChoreographyDraftConsequences,
  ChoreographyDraftPreview,
} from "./draft.shared";
import type { ChoreographyModalityOption } from "./modality.server";

export const choreographyDraftSchema = z.object({
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  experienceLevelId: z.string(),
  modalityId: z.string(),
  name: z.string().trim().min(1, requiredFieldMessage),
  professionalEvaluation: z.boolean(),
  professorIds: z.array(z.string()),
  scheduleCapacityId: z.string(),
  submodalityId: z.string(),
});

/** The choreography as it is saved, in the shape the form edits. */
export function toSavedChoreographyDraft(
  choreography: ChoreographyDetail,
): ChoreographyDraft {
  return {
    dancerIds: choreography.dancers.map((dancer) => dancer.id),
    experienceLevelId: choreography.experienceLevelId ?? "",
    modalityId: choreography.modalityId,
    name: choreography.name,
    professionalEvaluation: choreography.professionalEvaluation,
    professorIds: choreography.professors.map((professor) => professor.id),
    scheduleCapacityId: choreography.scheduleCapacityId,
    submodalityId: choreography.submodalityId ?? "",
  };
}

/**
 * Whether the draft differs from what is saved. The roster is a set, so ticking
 * a dancer off and on again is no change; neither is picking the modality or
 * the capacity already held.
 */
export function isChoreographyDraftDirty(
  draft: ChoreographyDraft,
  saved: ChoreographyDraft,
) {
  return (
    draft.name.trim() !== saved.name ||
    draft.modalityId !== saved.modalityId ||
    draft.submodalityId !== saved.submodalityId ||
    draft.experienceLevelId !== saved.experienceLevelId ||
    draft.professionalEvaluation !== saved.professionalEvaluation ||
    draft.scheduleCapacityId !== saved.scheduleCapacityId ||
    !haveSameIds(draft.dancerIds, saved.dancerIds) ||
    !haveSameIds(draft.professorIds, saved.professorIds)
  );
}

/**
 * Whether the draft is fully answered against the preview it matches: nothing
 * blocks it, and every choice the resolution left open is made with one of its
 * options. A field the draft leaves as saved, under a placement that did not
 * move, is not asked again, which is how the save treats it too: a rename is
 * never held hostage by a level that went missing earlier.
 */
export function isChoreographyDraftResolved(input: {
  draft: ChoreographyDraft;
  preview: ChoreographyDraftPreview;
  saved: ChoreographyDraft;
}) {
  const { draft, preview, saved } = input;
  const modalityChanged = draft.modalityId !== saved.modalityId;
  const classificationChanged =
    modalityChanged || !haveSameIds(draft.dancerIds, saved.dancerIds);

  return (
    preview.blockers.length === 0 &&
    draft.name.trim().length > 0 &&
    draft.dancerIds.length > 0 &&
    ((!modalityChanged && draft.submodalityId === saved.submodalityId) ||
      isAnswered(preview.submodality.options, draft.submodalityId)) &&
    ((!classificationChanged &&
      draft.experienceLevelId === saved.experienceLevelId) ||
      isAnswered(
        preview.experienceLevel.required ? preview.experienceLevel.options : [],
        draft.experienceLevelId,
      )) &&
    (draft.scheduleCapacityId === saved.scheduleCapacityId ||
      isAnswered(preview.scheduleCapacity.options, draft.scheduleCapacityId))
  );
}

/** One of the options when there are any, and nothing when there are none. */
function isAnswered(
  options: ReadonlyArray<{ id: string; isFull?: boolean }>,
  value: string,
) {
  if (options.length === 0) {
    return value === "";
  }

  return options.some((option) => option.id === value && !option.isFull);
}

export function hasChoreographyDraftConsequences(
  consequences: ChoreographyDraftConsequences,
) {
  return (
    consequences.withdrawnDancers.length > 0 ||
    consequences.category !== null ||
    consequences.groupType !== null ||
    consequences.scheduleCapacity !== null ||
    consequences.price !== null
  );
}

const noCompatibleScheduleOptionSuffix = " (sin cronograma compatible)";

/**
 * `disabled` marks only the structural dead end: no schedule of the event
 * accepts the modality, so the choreography would be left with none. The
 * modality held today is never disabled, so it can always be re-selected.
 */
export function getModalitySelectOptions(
  options: readonly ChoreographyModalityOption[],
  currentModalityId: string,
) {
  return options.map((option) => {
    const isDeadEnd =
      !option.hasCompatibleScheduleCapacity && option.id !== currentModalityId;

    return {
      disabled: isDeadEnd,
      label: isDeadEnd
        ? `${option.name}${noCompatibleScheduleOptionSuffix}`
        : option.name,
      value: option.id,
    };
  });
}

import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/**
 * The detail is one form with one draft: every editable field waits for
 * `Guardar`. `resolve-draft` answers what the draft would make of the
 * choreography without writing anything; `save-draft` writes all of it in one
 * transaction, or nothing.
 */
export const resolveChoreographyDraftIntent = "resolve-draft";
export const saveChoreographyDraftIntent = "save-draft";

/**
 * Empty strings stand for an unanswered field, as they do in the form: a select
 * with nothing chosen, or a capacity the resolution left to pick.
 */
export type ChoreographyDraft = {
  dancerIds: string[];
  experienceLevelId: string;
  modalityId: string;
  name: string;
  professionalEvaluation: boolean;
  professorIds: string[];
  scheduleCapacityId: string;
  submodalityId: string;
};

const draftFieldNames = {
  dancerIds: "dancerIds",
  experienceLevelId: "experienceLevelId",
  modalityId: "modalityId",
  name: "name",
  previewedCategoryId: "previewedCategoryId",
  professionalEvaluation: "professionalEvaluation",
  professorIds: "professorIds",
  scheduleCapacityId: "scheduleCapacityId",
  submodalityId: "submodalityId",
} as const;

export function toChoreographyDraftFormData(input: {
  draft: ChoreographyDraft;
  intent:
    typeof resolveChoreographyDraftIntent | typeof saveChoreographyDraftIntent;
  /** The category the preview showed, so the save can tell it went stale. */
  previewedCategoryId?: string | null;
}) {
  const formData = new FormData();
  formData.set("intent", input.intent);
  formData.set(draftFieldNames.name, input.draft.name);
  formData.set(draftFieldNames.modalityId, input.draft.modalityId);
  formData.set(draftFieldNames.submodalityId, input.draft.submodalityId);
  formData.set(
    draftFieldNames.experienceLevelId,
    input.draft.experienceLevelId,
  );
  formData.set(
    draftFieldNames.scheduleCapacityId,
    input.draft.scheduleCapacityId,
  );
  formData.set(
    draftFieldNames.professionalEvaluation,
    input.draft.professionalEvaluation ? "true" : "false",
  );

  for (const dancerId of input.draft.dancerIds) {
    formData.append(draftFieldNames.dancerIds, dancerId);
  }

  for (const professorId of input.draft.professorIds) {
    formData.append(draftFieldNames.professorIds, professorId);
  }

  formData.set(
    draftFieldNames.previewedCategoryId,
    input.previewedCategoryId ?? "",
  );

  return formData;
}

export function readChoreographyDraftFormData(formData: FormData): {
  draft: ChoreographyDraft;
  previewedCategoryId: string | null;
} {
  const previewedCategoryId = readString(
    formData,
    draftFieldNames.previewedCategoryId,
  );

  return {
    draft: {
      dancerIds: readStrings(formData, draftFieldNames.dancerIds),
      experienceLevelId: readString(
        formData,
        draftFieldNames.experienceLevelId,
      ),
      modalityId: readString(formData, draftFieldNames.modalityId),
      name: readString(formData, draftFieldNames.name),
      professionalEvaluation:
        readString(formData, draftFieldNames.professionalEvaluation) === "true",
      professorIds: readStrings(formData, draftFieldNames.professorIds),
      scheduleCapacityId: readString(
        formData,
        draftFieldNames.scheduleCapacityId,
      ),
      submodalityId: readString(formData, draftFieldNames.submodalityId),
    },
    previewedCategoryId:
      previewedCategoryId.length > 0 ? previewedCategoryId : null,
  };
}

/**
 * The inputs that move the classification: the modality and the dancers, in
 * any order. The name, the professors, the submodality and the level move none
 * of the derived fields, so editing them asks nothing of the server.
 */
export function getChoreographyDraftClassificationKey(
  draft: Pick<ChoreographyDraft, "dancerIds" | "modalityId">,
) {
  return [draft.modalityId, [...draft.dancerIds].sort().join(",")].join("|");
}

/**
 * What a preview answers for: the classification inputs and the capacity, whose
 * move is what the price and schedule consequences hang on.
 */
export function getChoreographyDraftPreviewKey(
  draft: Pick<
    ChoreographyDraft,
    "dancerIds" | "modalityId" | "scheduleCapacityId"
  >,
) {
  return `${getChoreographyDraftClassificationKey(draft)}|${draft.scheduleCapacityId}`;
}

/**
 * Where a reason belongs on the page: next to the roster, the modality, the
 * category or the schedule, not only in an alert at the top.
 */
export type ChoreographyDraftBlockerCode =
  "category" | "dancers" | "modality" | "schedule-capacity";

export type ChoreographyDraftBlocker = {
  code: ChoreographyDraftBlockerCode;
  message: string;
};

/** The part of a save the administrator did not edit directly. */
export type ChoreographyDraftConsequences = {
  category: { from: string; to: string } | null;
  groupType: { from: ChoreographyGroupType; to: ChoreographyGroupType } | null;
  price: { from: number | null; to: number | null } | null;
  scheduleCapacity: { from: string; to: string } | null;
  /** Removed dancers whose inscription holds money or a comprobante line. */
  withdrawnDancers: Array<{ id: string; name: string }>;
};

export type ChoreographyDraftPreview = {
  category: { id: string; name: string } | null;
  consequences: ChoreographyDraftConsequences;
  blockers: ChoreographyDraftBlocker[];
  experienceLevel: {
    options: Array<{ id: string; name: string }>;
    required: boolean;
  };
  /** The modality and dancers this answers for. */
  classificationKey: string;
  groupType: ChoreographyGroupType;
  /** The draft this answers for, with the capacity the resolution settled on. */
  key: string;
  scheduleCapacity: {
    options: ScheduleCapacitySelectOption[];
    /**
     * The capacity the draft lands on without asking: the current one while it
     * still fits, or the only compatible one. `null` leaves the choice to the
     * administrator.
     */
    selectedId: string | null;
  };
  /**
   * Why the structural fields are closed, or `null` while they are open. The
   * name stays editable either way.
   */
  structuralLock: string | null;
  submodality: {
    options: Array<{ id: string; name: string }>;
  };
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

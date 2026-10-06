import { db } from "@/db";
import { loadEventPriceRows } from "@/lib/prices/rows.server";
import {
  evaluatedChoreographyMessage,
  noCompatibleCategoryModalityMessage,
  noCompatibleCategoryRosterMessage,
} from "@/lib/choreographies/choreography-messages";
import { isChoreographyNameChanged } from "@/lib/choreographies/choreography-name";
import { readRosterDancers } from "@/lib/choreographies/choreography-roster-dancers.server";
import { haveSameIds } from "@/lib/choreographies/choreography-roster.shared";
import {
  deriveGroupType,
  resolveChoreographyClassificationForResolvedDancers,
  validateResolvedDancers,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import {
  getEventBases,
  resolveEventBasesScheduleModalityIds,
} from "@/lib/events/bases.server";
import { selectApplicableInscriptionPrice } from "@/lib/finances/inscription-price";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { ChoreographyDetail } from "./choreography-queries.server";
import {
  resolveDraftScheduleOptions,
  selectDraftScheduleOption,
  toAssignedScheduleOption,
  type DraftScheduleOption,
} from "./draft-schedule.server";
import {
  getChoreographyDraftClassificationKey,
  getChoreographyDraftPreviewKey,
  type ChoreographyDraft,
  type ChoreographyDraftBlocker,
  type ChoreographyDraftConsequences,
  type ChoreographyDraftPreview,
} from "./draft.shared";

const invalidModalityMessage = "Elegí una modalidad válida del evento activo.";

const incompatibleModalityMessage =
  "No se puede cambiar la modalidad: ningún cronograma del evento acepta esa modalidad.";

/**
 * Everything the draft makes of the choreography. The preview is what the view
 * reads; the rest is what the save writes from, so the two cannot disagree on
 * what the draft means.
 */
export type ChoreographyDraftResolution = {
  changes: {
    classification: boolean;
    dancers: boolean;
    modality: boolean;
    name: boolean;
    professors: boolean;
  };
  /**
   * The re-resolved placement, or `null` when neither the modality nor the
   * dancers changed: then the saved one stands untouched, even where a later
   * birth-date correction left it out of range.
   */
  classification: {
    categoryAgeBasis: number | null;
    categoryCalculationMode: ReturnType<
      typeof resolveChoreographyClassificationForResolvedDancers
    >["categoryCalculationMode"];
    categoryId: string | null;
    groupType: ChoreographyGroupType;
  } | null;
  preview: ChoreographyDraftPreview;
  /** The dancers with the ages the draft places them with. */
  resolvedDancers: ResolvedRegistrationDancer[];
  schedule: {
    /** The compatible capacities the price filter left out. */
    priceDivergentIds: string[];
    options: DraftScheduleOption[];
  };
};

/**
 * Resolves a draft of the detail without writing anything. The classification
 * goes through the same path as registration and every other correction
 * (`resolveChoreographyClassificationForResolvedDancers`), and only when the
 * modality or the dancers changed; the schedule options are the compatible
 * capacities minus the ones that would reprice a money-holding inscription, the
 * same split the lock's guard makes at save.
 */
export async function resolveChoreographyDraft(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  eventId: string;
}): Promise<ChoreographyDraftResolution> {
  const { choreography, draft } = input;
  const changes = readDraftChanges(choreography, draft);

  if (choreography.isEvaluated) {
    return resolveLockedDraft({ changes, choreography });
  }

  const eventBases = await getEventBases(input.eventId);
  const placement = changes.classification
    ? await resolveChangedPlacement({
        changes,
        choreography,
        draft,
        eventBases,
        eventId: input.eventId,
      })
    : toSavedPlacement(choreography);
  const { category, groupType } = placement;
  const blockers = [...placement.blockers];

  const schedule =
    category === null
      ? { divergentIds: [], options: [], reason: null }
      : await resolveDraftScheduleOptions({
          categoryId: category.id,
          choreography,
          classificationChanged: changes.classification,
          eventId: input.eventId,
          groupType,
          modalityId: draft.modalityId,
        });

  if (schedule.reason) {
    blockers.push({ code: "schedule-capacity", message: schedule.reason });
  }

  const selected = selectDraftScheduleOption({
    choreography,
    draft,
    options: schedule.options,
  });
  const consequences = await readDraftConsequences({
    category,
    choreography,
    draft,
    eventId: input.eventId,
    groupType,
    selected,
  });

  return {
    changes,
    classification: placement.classification,
    preview: {
      blockers,
      category,
      consequences,
      classificationKey: getChoreographyDraftClassificationKey(draft),
      experienceLevel: placement.experienceLevel,
      groupType,
      key: getChoreographyDraftPreviewKey({
        ...draft,
        scheduleCapacityId: selected?.id ?? "",
      }),
      scheduleCapacity: {
        options: schedule.options.map(({ id, isFull, label }) => ({
          id,
          isFull,
          label,
        })),
        selectedId: selected?.id ?? null,
      },
      structuralLock: null,
      submodality: {
        options: listSubmodalityOptions(eventBases, draft.modalityId),
      },
    },
    resolvedDancers: placement.resolvedDancers,
    schedule: {
      options: schedule.options,
      priceDivergentIds: schedule.divergentIds,
    },
  };
}

/** Where the draft places the choreography, before any schedule. */
type DraftPlacement = Pick<
  ChoreographyDraftResolution,
  "classification" | "resolvedDancers"
> &
  Pick<
    ChoreographyDraftPreview,
    "category" | "experienceLevel" | "groupType"
  > & {
    blockers: ChoreographyDraftBlocker[];
  };

function toSavedPlacement(choreography: ChoreographyDetail): DraftPlacement {
  return {
    blockers: [],
    category: { id: choreography.categoryId, name: choreography.categoryName },
    classification: null,
    experienceLevel: {
      options: choreography.experienceLevelOptions,
      required: choreography.requiresExperienceLevel,
    },
    groupType: choreography.groupType,
    resolvedDancers: [],
  };
}

/**
 * Re-resolves the placement from the drafted modality and dancers. A refused
 * modality or roster leaves no category, and its reason goes beside the field
 * that caused it.
 */
async function resolveChangedPlacement(input: {
  changes: ChoreographyDraftResolution["changes"];
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  eventBases: Awaited<ReturnType<typeof getEventBases>>;
  eventId: string;
}): Promise<DraftPlacement> {
  const [modalityBlocker, roster] = await Promise.all([
    findModalityBlocker({
      eventBases: input.eventBases,
      eventId: input.eventId,
      modalityChanged: input.changes.modality,
      modalityId: input.draft.modalityId,
    }),
    readDraftDancers(input),
  ]);
  if (modalityBlocker || !roster.ok) {
    return {
      blockers: [
        ...(modalityBlocker ? [modalityBlocker] : []),
        ...(roster.ok ? [] : [toDancersBlocker(roster.message)]),
      ],
      category: null,
      classification: null,
      experienceLevel: { options: [], required: false },
      groupType: deriveGroupType(input.draft.dancerIds.length),
      resolvedDancers: [],
    };
  }

  const resolved = resolveChoreographyClassificationForResolvedDancers({
    dancers: roster.dancers,
    eventBases: input.eventBases,
    modalityId: input.draft.modalityId,
  });
  const category =
    resolved.category.status === "resolved"
      ? { id: resolved.category.id, name: resolved.category.name }
      : null;

  return {
    blockers: category ? [] : [toNoCategoryBlocker(input.changes)],
    category,
    classification: {
      categoryAgeBasis: resolved.categoryAgeBasis,
      categoryCalculationMode: resolved.categoryCalculationMode,
      categoryId: category?.id ?? null,
      groupType: resolved.groupType,
    },
    experienceLevel: {
      options: resolved.experienceLevel.options,
      required: resolved.experienceLevel.required,
    },
    groupType: resolved.groupType,
    resolvedDancers: roster.dancers,
  };
}

function toDancersBlocker(message: string): ChoreographyDraftBlocker {
  return { code: "dancers", message };
}

/**
 * The reason names the modality when the modality alone moved, and the roster
 * otherwise: it is the field the administrator has to go back to.
 */
function toNoCategoryBlocker(
  changes: ChoreographyDraftResolution["changes"],
): ChoreographyDraftBlocker {
  return {
    code: "category",
    message:
      changes.modality && !changes.dancers
        ? noCompatibleCategoryModalityMessage
        : noCompatibleCategoryRosterMessage,
  };
}

function readDraftChanges(
  choreography: ChoreographyDetail,
  draft: ChoreographyDraft,
): ChoreographyDraftResolution["changes"] {
  const dancers = !haveSameIds(
    choreography.dancers.map((dancer) => dancer.id),
    draft.dancerIds,
  );
  const modality = draft.modalityId !== choreography.modalityId;

  return {
    classification: dancers || modality,
    dancers,
    modality,
    name: isChoreographyNameChanged(draft.name, choreography.name),
    professors: !haveSameIds(
      choreography.professors.map((professor) => professor.id),
      draft.professorIds,
    ),
  };
}

/**
 * An evaluated choreography answers with what it has saved: its structure is
 * closed, so nothing the draft says about it is resolved.
 */
function resolveLockedDraft(input: {
  changes: ChoreographyDraftResolution["changes"];
  choreography: ChoreographyDetail;
}): ChoreographyDraftResolution {
  const { choreography } = input;
  const assigned = toAssignedScheduleOption(choreography);

  return {
    changes: input.changes,
    classification: null,
    preview: {
      blockers: [],
      category: {
        id: choreography.categoryId,
        name: choreography.categoryName,
      },
      consequences: noConsequences(),
      experienceLevel: {
        options: choreography.experienceLevelOptions,
        required: choreography.requiresExperienceLevel,
      },
      classificationKey: getChoreographyDraftClassificationKey({
        dancerIds: choreography.dancers.map((dancer) => dancer.id),
        modalityId: choreography.modalityId,
      }),
      groupType: choreography.groupType,
      key: getChoreographyDraftPreviewKey({
        dancerIds: choreography.dancers.map((dancer) => dancer.id),
        modalityId: choreography.modalityId,
        scheduleCapacityId: assigned.id,
      }),
      scheduleCapacity: {
        options: [{ id: assigned.id, isFull: false, label: assigned.label }],
        selectedId: assigned.id,
      },
      structuralLock: evaluatedChoreographyMessage,
      submodality: {
        options:
          choreography.submodalityId && choreography.submodalityName
            ? [
                {
                  id: choreography.submodalityId,
                  name: choreography.submodalityName,
                },
              ]
            : [],
      },
    },
    resolvedDancers: [],
    schedule: { options: [assigned], priceDivergentIds: [] },
  };
}

/**
 * A modality outside the event is refused, and so is one no schedule accepts:
 * the choreography would be left with no schedule. The saved modality is
 * exempt from the second check, so a modality that lost its schedule still
 * lets the roster be corrected.
 */
async function findModalityBlocker(input: {
  eventBases: Awaited<ReturnType<typeof getEventBases>>;
  eventId: string;
  modalityChanged: boolean;
  modalityId: string;
}): Promise<ChoreographyDraftBlocker | null> {
  if (!input.eventBases.modalities.some(({ id }) => id === input.modalityId)) {
    return { code: "modality", message: invalidModalityMessage };
  }

  if (!input.modalityChanged) {
    return null;
  }

  const scheduledModalityIds = await resolveEventBasesScheduleModalityIds(
    input.eventId,
  );

  return scheduledModalityIds.includes(input.modalityId)
    ? null
    : { code: "modality", message: incompatibleModalityMessage };
}

async function readDraftDancers(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  eventId: string;
}): Promise<
  | { ok: true; dancers: ResolvedRegistrationDancer[] }
  | { ok: false; message: string }
> {
  const roster = await readRosterDancers({
    academyId: input.choreography.academyId,
    choreographyId: input.choreography.id,
    dancerIds: input.draft.dancerIds,
    eventId: input.eventId,
  });

  if (!roster.ok) {
    return roster;
  }

  const failure = validateResolvedDancers(roster.dancers);

  return failure ? { ok: false, message: failure.error } : roster;
}

async function readDraftConsequences(input: {
  category: ChoreographyDraftPreview["category"];
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  eventId: string;
  groupType: ChoreographyGroupType;
  selected: DraftScheduleOption | null;
}): Promise<ChoreographyDraftConsequences> {
  const { choreography } = input;
  const keptDancerIds = new Set(input.draft.dancerIds);

  return {
    category:
      input.category && input.category.id !== choreography.categoryId
        ? { from: choreography.categoryName, to: input.category.name }
        : null,
    groupType:
      input.groupType === choreography.groupType
        ? null
        : { from: choreography.groupType, to: input.groupType },
    price: input.selected
      ? await readPriceMove({
          choreography,
          destination: {
            groupType: input.groupType,
            scheduleId: input.selected.scheduleId,
          },
          eventId: input.eventId,
        })
      : null,
    scheduleCapacity: readScheduleMove(choreography, input.selected),
    withdrawnDancers: choreography.dancers
      .filter((dancer) => dancer.hasEvidence && !keptDancerIds.has(dancer.id))
      .map((dancer) => ({
        id: dancer.id,
        name: `${dancer.firstName} ${dancer.lastName}`,
      })),
  };
}

/**
 * A capacity of the same schedule for another group type reads the same: the
 * group type line already says what moved.
 */
function readScheduleMove(
  choreography: ChoreographyDetail,
  selected: DraftScheduleOption | null,
): ChoreographyDraftConsequences["scheduleCapacity"] {
  if (
    selected === null ||
    selected.id === choreography.scheduleCapacityId ||
    selected.bareLabel === choreography.scheduleLabel
  ) {
    return null;
  }

  return { from: choreography.scheduleLabel, to: selected.bareLabel };
}

/**
 * The list price per dancer that applies today, before and after, or `null`
 * when the move keeps it. Inscriptions past their deposit keep the price they
 * froze: a move that would reprice one is refused, not announced.
 */
async function readPriceMove(input: {
  choreography: ChoreographyDetail;
  destination: { groupType: ChoreographyGroupType; scheduleId: string };
  eventId: string;
}): Promise<ChoreographyDraftConsequences["price"]> {
  if (
    input.destination.groupType === input.choreography.groupType &&
    input.destination.scheduleId === input.choreography.scheduleId
  ) {
    return null;
  }

  const priceRows = await loadEventPriceRows(db, input.eventId);
  const businessDate = getBusinessDateOnly();
  const priceAt = (key: {
    groupType: ChoreographyGroupType;
    scheduleId: string;
  }) =>
    selectApplicableInscriptionPrice({
      businessDate,
      key: {
        choreographyScheduleId: key.scheduleId,
        groupType: key.groupType,
        scheduleCapacityScheduleId: null,
      },
      priceRows,
    })?.amount ?? null;
  const from = priceAt({
    groupType: input.choreography.groupType,
    scheduleId: input.choreography.scheduleId,
  });
  const to = priceAt(input.destination);

  return from === to ? null : { from, to };
}

function listSubmodalityOptions(
  eventBases: Awaited<ReturnType<typeof getEventBases>>,
  modalityId: string,
) {
  return eventBases.submodalities
    .filter((submodality) => submodality.modalityId === modalityId)
    .map((submodality) => ({ id: submodality.id, name: submodality.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function noConsequences(): ChoreographyDraftConsequences {
  return {
    category: null,
    groupType: null,
    price: null,
    scheduleCapacity: null,
    withdrawnDancers: [],
  };
}

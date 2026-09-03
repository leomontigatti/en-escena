import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, dancers, events } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  resolveChoreographyRegistrationOperationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import {
  assertPortalChoreographyFound,
  portalOwnedChoreographyWhere,
} from "@/lib/choreographies/choreography-access.server";
import {
  choreographyNotFoundMessage,
  invalidExperienceLevelMessage,
} from "@/lib/choreographies/choreography-messages";
import {
  compatibleScheduleSelectionRequiredMessage,
  getDancerEditingEligibility,
  getGlobalScheduleCapacityOptionId,
  getResolvedChoreographyCategory,
  invalidDancerSelectionMessage,
  type ChoreographyDancerScheduleResolution,
  type ResolveChoreographyDancersResult,
  type ResolvedChoreographyDancerUpdateContext,
} from "@/lib/choreographies/choreography-roster.shared";
import {
  type ExperienceLevel,
  isExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  isSelectableForRoster,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

export async function resolveChoreographyDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
}): Promise<ResolveChoreographyDancersResult> {
  const resolvedUpdate = await resolveChoreographyDancerUpdateContext(input);

  if (!resolvedUpdate.ok) {
    return resolvedUpdate;
  }

  const { resolution, scheduleResolution } = resolvedUpdate;
  const category = getResolvedChoreographyCategory(resolution);

  return {
    ok: true,
    resolution: {
      groupType: resolution.groupType,
      categoryId: category.id,
      categoryName: category.name,
      categoryCalculationMode: resolution.categoryCalculationMode,
      categoryAgeBasis: resolution.categoryAgeBasis,
      experienceLevel: resolution.experienceLevel,
      schedule: scheduleResolution,
    },
  };
}

export async function resolveChoreographyDancerUpdateContext(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
}): Promise<ResolvedChoreographyDancerUpdateContext> {
  const choreography = assertPortalChoreographyFound(
    await db.query.choreographies.findFirst({
      columns: {
        id: true,
        modalityId: true,
        submodalityId: true,
        categoryId: true,
        experienceLevelId: true,
        scheduleId: true,
        scheduleCapacityId: true,
        hasPresentation: true,
      },
      where: portalOwnedChoreographyWhere(input),
    }),
  );

  const eligibility = getDancerEditingEligibility({
    hasPresentation: choreography.hasPresentation,
  });

  if (!eligibility.canEdit) {
    return {
      ok: false,
      message: eligibility.reasonText,
    };
  }

  const requestedDancerIds = [...new Set(input.dancerIds)];
  // Only the active ones count as "already on the roster": that exception exists
  // so an inactive dancer who already appears is not blocked, and a withdrawn
  // inscription does not appear.
  const currentLinks = await db
    .select({
      dancerId: choreographyDancers.dancerId,
    })
    .from(choreographyDancers)
    .where(
      and(
        eq(choreographyDancers.choreographyId, input.choreographyId),
        activeInscription(),
      ),
    );
  const linkedDancerIds = new Set(currentLinks.map((row) => row.dancerId));

  const selectedDancers =
    requestedDancerIds.length > 0
      ? await db.query.dancers.findMany({
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            active: true,
          },
          where: and(
            eq(dancers.academyId, input.academyId),
            inArray(dancers.id, requestedDancerIds),
          ),
        })
      : [];

  const allowedDancerIds = new Set(
    selectedDancers
      .filter((dancer) =>
        isSelectableForRoster({
          status: toRosterPersonStatus(dancer.active),
          isAlreadyLinked: linkedDancerIds.has(dancer.id),
        }),
      )
      .map((dancer) => dancer.id),
  );

  if (
    selectedDancers.length !== requestedDancerIds.length ||
    requestedDancerIds.some((id) => !allowedDancerIds.has(id))
  ) {
    return {
      ok: false,
      message: invalidDancerSelectionMessage,
    };
  }

  const event = await db.query.events.findFirst({
    columns: { startsAt: true },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventLocalStartDate = getLocalDateParts(event.startsAt);
  const selectedDancerById = new Map(
    selectedDancers.map((dancer) => [dancer.id, dancer]),
  );
  const resolvedDancers = requestedDancerIds.map((dancerId) => {
    const dancer = selectedDancerById.get(dancerId);

    if (!dancer) {
      throw new Error("Expected selected dancer to exist after validation.");
    }

    return {
      id: dancer.id,
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      ageAtEventStart: getAgeAtDate(dancer.birthDate, eventLocalStartDate),
    } satisfies ResolvedRegistrationDancer;
  });

  const resolution =
    await resolveChoreographyRegistrationOperationForResolvedDancers({
      eventId: input.eventId,
      modalityId: choreography.modalityId,
      submodalityId: choreography.submodalityId,
      dancers: resolvedDancers,
    });

  if (!resolution.ok) {
    return {
      ok: false,
      message: resolution.error,
    };
  }

  return {
    ok: true,
    choreography,
    resolvedDancers,
    resolution: resolution.resolution,
    scheduleResolution: resolveDancerUpdateScheduleSelection(
      getScheduleSelectionId(choreography),
      resolution.resolution,
    ),
  };
}

export function resolveSelectedExperienceLevelId(input: {
  currentCategoryId: string | null;
  currentExperienceLevelId: string | null;
  experienceLevelId: string | null;
  resolution: ChoreographyRegistrationOperationResolution;
}):
  | { ok: true; value: ExperienceLevel | null }
  | {
      ok: false;
      message: string;
      fieldErrors: {
        experienceLevelId: string;
      };
    } {
  if (!input.resolution.experienceLevel.required) {
    return { ok: true, value: null };
  }

  const resolvedCategoryId = getResolvedChoreographyCategory(
    input.resolution,
  ).id;
  const categoryChanged = input.currentCategoryId !== resolvedCategoryId;

  if (
    !categoryChanged &&
    input.currentExperienceLevelId &&
    isExperienceLevel(input.currentExperienceLevelId) &&
    input.resolution.experienceLevel.options.some(
      (option) => option.id === input.currentExperienceLevelId,
    )
  ) {
    return { ok: true, value: input.currentExperienceLevelId };
  }

  if (!input.experienceLevelId) {
    return {
      ok: false,
      message: invalidExperienceLevelMessage,
      fieldErrors: {
        experienceLevelId: "Este campo es obligatorio.",
      },
    };
  }

  if (!isExperienceLevel(input.experienceLevelId)) {
    return {
      ok: false,
      message: invalidExperienceLevelMessage,
      fieldErrors: {
        experienceLevelId: invalidExperienceLevelMessage,
      },
    };
  }

  const isAllowedLevel = input.resolution.experienceLevel.options.some(
    (option) => option.id === input.experienceLevelId,
  );

  if (!isAllowedLevel) {
    return {
      ok: false,
      message: invalidExperienceLevelMessage,
      fieldErrors: {
        experienceLevelId: invalidExperienceLevelMessage,
      },
    };
  }

  return { ok: true, value: input.experienceLevelId };
}

/**
 * Compatibility rule shared by the select UIs (#709) and, since #730, by the
 * roster save path's own final revalidation: `currentScheduleCapacityId` is a
 * "selection id" (see `getScheduleSelectionId`) — a real `scheduleCapacityId`,
 * or the encoded global/whole-schedule id for the no-specific-capacity case —
 * not necessarily the id of an actual `scheduleCapacities` row.
 */
export function isCompatibleScheduleCapacity(
  currentScheduleCapacityId: string,
  resolution: ChoreographyRegistrationOperationResolution,
) {
  if (resolution.schedule.status === "none") {
    return false;
  }

  if (resolution.schedule.status === "auto") {
    return resolution.schedule.scheduleCapacityId === currentScheduleCapacityId;
  }

  return resolution.schedule.options.some(
    (option) => option.id === currentScheduleCapacityId,
  );
}

function resolveDancerUpdateScheduleSelection(
  currentScheduleCapacityId: string,
  resolution: ChoreographyRegistrationOperationResolution,
): ChoreographyDancerScheduleResolution {
  if (isCompatibleScheduleCapacity(currentScheduleCapacityId, resolution)) {
    let currentOption = resolution.schedule.options.find(
      (option) => option.id === currentScheduleCapacityId,
    );

    if (!currentOption && resolution.schedule.status === "auto") {
      [currentOption] = resolution.schedule.options;
    }

    if (!currentOption) {
      return {
        status: "none",
        canSave: false,
        error:
          "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
        options: [],
        selectedScheduleCapacityId: null,
      };
    }

    return {
      status: "keep-current",
      canSave: true,
      // Same path as the standalone reassignment
      // (`resolveScheduleCapacityCandidates`): the select offers the full
      // compatible set, not just the assigned capacity, even though it's still
      // compatible. When the resolution is "auto" there's no other capacity to
      // choose from, so the single option stays as before.
      options:
        resolution.schedule.status === "multiple"
          ? resolution.schedule.options
          : [currentOption],
      selectedScheduleCapacityId: currentOption.id,
    };
  }

  if (resolution.schedule.status === "none") {
    return {
      status: "none",
      canSave: false,
      error: resolution.schedule.error,
      options: [],
      selectedScheduleCapacityId: null,
    };
  }

  if (resolution.schedule.status === "auto") {
    return {
      status: "auto",
      canSave: true,
      options: resolution.schedule.options,
      selectedScheduleCapacityId: resolution.schedule.scheduleCapacityId,
    };
  }

  return {
    status: "multiple",
    canSave: true,
    options: resolution.schedule.options,
    selectedScheduleCapacityId: null,
  };
}

export function resolveSelectedScheduleCapacityIdForDancerUpdate(input: {
  schedule: ChoreographyDancerScheduleResolution;
  scheduleCapacityId: string | null;
}):
  | {
      ok: true;
      value: {
        scheduleId: string;
        scheduleCapacityId: string | null;
      };
    }
  | {
      ok: false;
      message: string;
      fieldErrors: {
        scheduleCapacityId: string;
      };
    } {
  if (
    input.schedule.status === "keep-current" ||
    input.schedule.status === "auto"
  ) {
    // `options` is no longer a singleton for "keep-current" (it can carry the
    // full compatible set): look up the assigned one by id instead of
    // assuming it's the first.
    const option = input.schedule.options.find(
      (candidate) => candidate.id === input.schedule.selectedScheduleCapacityId,
    );

    if (!option) {
      throw new Error(
        "Expected the keep-current/auto schedule resolution to include its selected option.",
      );
    }

    return {
      ok: true,
      value: {
        scheduleId: option.scheduleId,
        scheduleCapacityId: option.scheduleCapacityId,
      },
    };
  }

  if (input.schedule.status === "none") {
    return {
      ok: false,
      message: input.schedule.error,
      fieldErrors: {
        scheduleCapacityId: input.schedule.error,
      },
    };
  }

  const selectedOption = input.schedule.options.find(
    (option) => option.id === input.scheduleCapacityId,
  );

  if (!selectedOption) {
    return {
      ok: false,
      message: compatibleScheduleSelectionRequiredMessage,
      fieldErrors: {
        scheduleCapacityId: compatibleScheduleSelectionRequiredMessage,
      },
    };
  }

  return {
    ok: true,
    value: {
      scheduleId: selectedOption.scheduleId,
      scheduleCapacityId: selectedOption.scheduleCapacityId,
    },
  };
}

/**
 * Encodes a `{ scheduleId, scheduleCapacityId }` pair (a choreography row's
 * current assignment, or a resolved-but-not-yet-persisted selection) into the
 * "selection id" `isCompatibleScheduleCapacity` compares against a
 * resolution's compatible set: a real `scheduleCapacityId` when a specific
 * capacity is assigned, or the encoded global/whole-schedule id otherwise.
 */
export function getScheduleSelectionId(input: {
  scheduleId: string | null;
  scheduleCapacityId: string | null;
}) {
  if (input.scheduleCapacityId) {
    return input.scheduleCapacityId;
  }

  if (input.scheduleId) {
    return getGlobalScheduleCapacityOptionId(input.scheduleId);
  }

  return "";
}

function getLocalDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partMap.get("year")),
    month: Number(partMap.get("month")),
    day: Number(partMap.get("day")),
  };
}

function getAgeAtDate(
  birthDate: string,
  date: { year: number; month: number; day: number },
) {
  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map((value) => Number(value));
  const hasHadBirthday =
    date.month > birthMonth ||
    (date.month === birthMonth && date.day >= birthDay);

  return date.year - birthYear - (hasHadBirthday ? 0 : 1);
}

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { dancers, events } from "@/db/schema";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";
import {
  getOverageDancersMessage,
  getUnderageDancersMessage,
  isOldEnoughAtEventStart,
  isYoungEnoughAtEventStart,
} from "@/lib/dancers/birth-date";
import {
  getClosedRegistrationPathMessage,
  invalidExperienceLevelMessage,
} from "@/lib/choreographies/choreography-messages";
import {
  resolveOfferedScheduleOptions,
  type ScheduleResolution,
} from "@/lib/choreographies/registration-schedule-options.server";
import {
  getEventBases,
  resolveEventBasesScheduleOptions,
  type EventBases,
} from "@/lib/events/bases.server";
import {
  type ExperienceLevel,
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";
import { getEventRegistrationReadinessForBases } from "@/lib/events/registration-readiness.server";
import { isEventRegistrationOpen } from "@/lib/schedules/registration-open.server";
import {
  classifyRosterPersonSelection,
  getRosterPersonRejectionMessage,
  noLinkedRosterPeople,
} from "@/lib/roster/roster-person-rejection";

const EVENT_TIME_ZONE = BUSINESS_TIME_ZONE;

type GroupType = "solo" | "duo" | "trio" | "grupal";
type CategoryCalculationMode = "oldest" | "group_tolerance" | "group_average";

export type ChoreographyRegistrationOperationInput = {
  academyId: string;
  eventId: string;
  modalityId: string;
  submodalityId: string | null;
  dancerIds: string[];
};

type RegistrationBaseResolutionInput = Omit<
  ChoreographyRegistrationOperationInput,
  "eventId"
> & {
  eventBases: EventBases;
  event: typeof events.$inferSelect;
};

type ExperienceLevelOption = {
  id: ExperienceLevel;
  name: string;
};

type DancerAgeSummary = {
  id: string;
  firstName: string;
  lastName: string;
  ageAtEventStart: number;
};

export type ResolvedRegistrationDancer = DancerAgeSummary;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type CategoryCandidate = {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
  experienceLevels: ExperienceLevel[];
};

type CategoryResolution =
  | {
      status: "resolved";
      id: string;
      name: string;
    }
  | {
      status: "pending";
      reason: "no-compatible-category";
    };

type ExperienceLevelResolution =
  | {
      required: true;
      options: ExperienceLevelOption[];
    }
  | {
      required: false;
      options: ExperienceLevelOption[];
    };

export type ChoreographyRegistrationOperationResolution = {
  groupType: GroupType;
  category: CategoryResolution;
  categoryCalculationMode: CategoryCalculationMode;
  categoryAgeBasis: number | null;
  experienceLevel: ExperienceLevelResolution;
  schedule: ScheduleResolution;
  dancers: DancerAgeSummary[];
};

export type ChoreographyRegistrationOperationFailureCode =
  | "event-not-found"
  | "event-not-active"
  | "registration-closed"
  | "event-not-ready"
  | "invalid-modality"
  | "submodality-required"
  | "invalid-submodality"
  | "experience-level-required"
  | "invalid-experience-level"
  | "invalid-dancers"
  | "dancer-under-minimum-age"
  | "dancer-over-maximum-age"
  | "no-compatible-category";

export type OperationFailure = {
  ok: false;
  code: ChoreographyRegistrationOperationFailureCode;
  error: string;
};

type OperationSuccess = {
  ok: true;
  resolution: ChoreographyRegistrationOperationResolution;
};

export type ChoreographyRegistrationOperationResult =
  OperationFailure | OperationSuccess;

export async function resolveChoreographyRegistrationOperation(
  input: ChoreographyRegistrationOperationInput,
): Promise<ChoreographyRegistrationOperationResult> {
  const event = await db.query.events.findFirst({
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    return failure(
      "event-not-found",
      "No encontramos ese evento para resolver el registro.",
    );
  }

  if (!event.active) {
    return failure(
      "event-not-active",
      "Solo podés registrar coreografías en el evento activo.",
    );
  }

  if (!(await isEventRegistrationOpen(event.id))) {
    return failure("registration-closed", "Las inscripciones están cerradas.");
  }

  const eventBases = await getEventBases(event.id);

  return resolveRegistrationBases({
    academyId: input.academyId,
    event,
    eventBases,
    modalityId: input.modalityId,
    submodalityId: input.submodalityId,
    dancerIds: input.dancerIds,
  });
}

export async function resolveChoreographyRegistrationOperationForResolvedDancers(input: {
  eventId: string;
  modalityId: string;
  submodalityId: string | null;
  dancers: ResolvedRegistrationDancer[];
}): Promise<ChoreographyRegistrationOperationResult> {
  const eventBases = await getEventBases(input.eventId);

  return await resolveRegistrationFromResolvedDancers({
    eventBases,
    eventId: input.eventId,
    modalityId: input.modalityId,
    // Administration re-resolves a choreography it already owns: its own switch
    // never refuses it, so the closed schedules stay on offer here.
    onlyOpenSchedules: false,
    skipReadinessCheck: true,
    submodalityId: input.submodalityId,
    dancers: input.dancers,
  });
}

export function resolveChoreographyClassificationForResolvedDancers(input: {
  eventBases: Pick<EventBases, "categories">;
  modalityId: string;
  dancers: ResolvedRegistrationDancer[];
}) {
  const groupType = deriveGroupType(input.dancers.length);
  const categoryCandidates = input.eventBases.categories
    .filter(
      (category) =>
        category.modalityIds.includes(input.modalityId) &&
        category.groupTypes.includes(groupType),
    )
    .map(toCategoryCandidate);
  const categoryResolution = resolveCategory({
    dancers: input.dancers,
    categories: categoryCandidates,
  });
  const experienceLevel = resolveExperienceLevel({
    requiredExperienceLevels:
      categoryResolution.resolvedCategoryExperienceLevels,
    category: categoryResolution.category,
  });

  return {
    groupType,
    category: categoryResolution.category,
    categoryCalculationMode: categoryResolution.categoryCalculationMode,
    categoryAgeBasis: categoryResolution.categoryAgeBasis,
    experienceLevel,
    dancers: input.dancers,
  } satisfies Omit<ChoreographyRegistrationOperationResolution, "schedule">;
}

async function resolveRegistrationBases(
  input: RegistrationBaseResolutionInput,
): Promise<ChoreographyRegistrationOperationResult> {
  const uniqueDancerIds = [...new Set(input.dancerIds)];

  if (
    uniqueDancerIds.length === 0 ||
    uniqueDancerIds.length !== input.dancerIds.length
  ) {
    return failure(
      "invalid-dancers",
      "Elegí uno o más bailarines válidos para resolver la coreografía.",
    );
  }

  const eventLocalStartDate = getEventLocalDateParts(input.event.startsAt);
  const resolvedDancers = await resolveDancers({
    academyId: input.academyId,
    dancerIds: uniqueDancerIds,
    eventLocalStartDate,
  });

  if (!resolvedDancers.ok) {
    return resolvedDancers.failure;
  }

  return await resolveRegistrationFromResolvedDancers({
    eventBases: input.eventBases,
    eventId: input.event.id,
    modalityId: input.modalityId,
    onlyOpenSchedules: true,
    skipReadinessCheck: false,
    submodalityId: input.submodalityId,
    dancers: resolvedDancers.dancers,
  });
}

async function resolveRegistrationFromResolvedDancers(input: {
  eventBases: EventBases;
  eventId: string;
  modalityId: string;
  onlyOpenSchedules: boolean;
  skipReadinessCheck: boolean;
  submodalityId: string | null;
  dancers: ResolvedRegistrationDancer[];
}): Promise<ChoreographyRegistrationOperationResult> {
  if (!input.skipReadinessCheck) {
    const readiness = await getEventRegistrationReadinessForBases(
      input.eventId,
      input.eventBases,
    );

    if (!readiness.isReady) {
      return failure(
        "event-not-ready",
        "El evento activo todavía no tiene las bases mínimas para registrar coreografías.",
      );
    }
  }

  const modality = input.eventBases.modalities.find(
    (record) => record.id === input.modalityId,
  );

  if (!modality) {
    return failure(
      "invalid-modality",
      "Elegí una modalidad válida del evento activo.",
    );
  }

  const modalitySubmodalities = input.eventBases.submodalities.filter(
    (record) => record.modalityId === modality.id,
  );
  const submodalityValidation = validateSubmodalitySelection({
    availableSubmodalities: modalitySubmodalities,
    submodalityId: input.submodalityId,
  });

  if (!submodalityValidation.ok) {
    return submodalityValidation.failure;
  }

  const dancerFailure = validateResolvedDancers(input.dancers);

  if (dancerFailure) {
    return dancerFailure;
  }

  const classification = resolveChoreographyClassificationForResolvedDancers({
    eventBases: input.eventBases,
    modalityId: modality.id,
    dancers: input.dancers,
  });

  const compatibleScheduleCapacities = await resolveEventBasesScheduleOptions({
    eventId: input.eventId,
    modalityId: modality.id,
    groupType: classification.groupType,
    categoryId: getResolvedCategoryId(classification.category),
  });
  const schedule = await resolveOfferedScheduleOptions({
    eventId: input.eventId,
    onlyOpen: input.onlyOpenSchedules,
    compatibleScheduleCapacities,
  });

  if (!schedule) {
    return failure(
      "registration-closed",
      getClosedRegistrationPathMessage({
        categoryName:
          classification.category.status === "resolved"
            ? classification.category.name
            : null,
        modalityName: modality.name,
        groupType: classification.groupType,
      }),
    );
  }

  return {
    ok: true,
    resolution: {
      groupType: classification.groupType,
      category: classification.category,
      categoryCalculationMode: classification.categoryCalculationMode,
      categoryAgeBasis: classification.categoryAgeBasis,
      experienceLevel: classification.experienceLevel,
      schedule,
      dancers: classification.dancers,
    },
  };
}

/**
 * The category the schedule resolution filters by, or nothing to filter by when
 * no category resolved — a flow category resolution already blocks before a
 * schedule matters.
 */
/**
 * The category id a classification settled on, or `null` while it has not: the
 * shape every caller that has to feed a resolved category to a column or to the
 * schedule resolver needs.
 */
export function getResolvedCategoryId(
  category: CategoryResolution,
): string | null {
  return category.status === "resolved" ? category.id : null;
}

export function deriveGroupType(dancerCount: number): GroupType {
  if (dancerCount === 1) {
    return "solo";
  }

  if (dancerCount === 2) {
    return "duo";
  }

  if (dancerCount === 3) {
    return "trio";
  }

  return "grupal";
}

export function validateSubmodalitySelection(input: {
  availableSubmodalities: Array<{ id: string }>;
  submodalityId: string | null;
}): { ok: true } | { ok: false; failure: OperationFailure } {
  if (input.availableSubmodalities.length > 0 && input.submodalityId === null) {
    return {
      ok: false,
      failure: failure(
        "submodality-required",
        "Elegí una submodalidad para la modalidad seleccionada.",
      ),
    };
  }

  if (input.submodalityId === null) {
    return { ok: true };
  }

  const hasMatchingSubmodality = input.availableSubmodalities.some(
    (record) => record.id === input.submodalityId,
  );

  if (!hasMatchingSubmodality) {
    return {
      ok: false,
      failure: failure(
        "invalid-submodality",
        "Elegí una submodalidad válida para la modalidad seleccionada.",
      ),
    };
  }

  return { ok: true };
}

/**
 * The twin of `validateSubmodalitySelection` for the experience level: it takes
 * the levels the resolved category allows and the submitted value, without
 * depending on a whole `ChoreographyRegistrationOperationResolution`. It is the
 * piece shared by portal sign-up, roster saving and the detail's standalone
 * reassignment.
 *
 * The levels are not a table: they are a global enum (`experienceLevelValues`)
 * and the category declares which ones it admits, so "valid" means belonging to
 * that list and nothing more.
 */
export function validateExperienceLevelSelection(input: {
  availableExperienceLevels: Array<{ id: string }>;
  experienceLevelId: string | null;
}): { ok: true } | { ok: false; failure: OperationFailure } {
  if (
    input.availableExperienceLevels.length > 0 &&
    input.experienceLevelId === null
  ) {
    return {
      ok: false,
      failure: failure(
        "experience-level-required",
        invalidExperienceLevelMessage,
      ),
    };
  }

  if (input.experienceLevelId === null) {
    return { ok: true };
  }

  const hasMatchingExperienceLevel = input.availableExperienceLevels.some(
    (record) => record.id === input.experienceLevelId,
  );

  if (!hasMatchingExperienceLevel) {
    return {
      ok: false,
      failure: failure(
        "invalid-experience-level",
        invalidExperienceLevelMessage,
      ),
    };
  }

  return { ok: true };
}

/**
 * The query no longer filters the roster status: it reads the rows the academy
 * picked and classifies them, so the rejection can name a dancer and a reason
 * instead of collapsing every cause into a length mismatch. The scope is still
 * the people picked for one choreography, so no cardinality bound changes.
 */
async function resolveDancers(input: {
  academyId: string;
  dancerIds: string[];
  eventLocalStartDate: LocalDateParts;
}): Promise<
  | { ok: true; dancers: DancerAgeSummary[] }
  | { ok: false; failure: OperationFailure }
> {
  const dancerRows = await db.query.dancers.findMany({
    where: and(
      eq(dancers.academyId, input.academyId),
      inArray(dancers.id, input.dancerIds),
    ),
    columns: {
      id: true,
      active: true,
      firstName: true,
      lastName: true,
      birthDate: true,
    },
  });

  const selection = classifyRosterPersonSelection({
    selectedIds: input.dancerIds,
    rows: dancerRows,
    linkedPersonIds: noLinkedRosterPeople,
  });

  if (selection.rejections.length > 0) {
    return {
      ok: false,
      failure: failure(
        "invalid-dancers",
        getRosterPersonRejectionMessage({
          kind: "dancer",
          rejections: selection.rejections,
        }),
      ),
    };
  }

  return {
    ok: true,
    dancers: selection.people.map((dancer) => ({
      id: dancer.id,
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      ageAtEventStart: getAgeAtDate(
        dancer.birthDate,
        input.eventLocalStartDate,
      ),
    })),
  };
}

function toCategoryCandidate(
  category: EventBases["categories"][number],
): CategoryCandidate {
  return {
    id: category.id,
    name: category.name,
    minAge: category.minAge,
    maxAge: category.maxAge,
    experienceLevels: category.experienceLevels.filter(isExperienceLevel),
  };
}

function resolveCategory(input: {
  dancers: DancerAgeSummary[];
  categories: CategoryCandidate[];
}): {
  category: CategoryResolution;
  categoryCalculationMode: CategoryCalculationMode;
  categoryAgeBasis: number | null;
  resolvedCategoryExperienceLevels: ExperienceLevel[];
} {
  if (input.dancers.length <= 3) {
    const oldestAge = Math.max(
      ...input.dancers.map((dancer) => dancer.ageAtEventStart),
    );
    const category = input.categories.find((candidate) =>
      isAgeWithinCategory(oldestAge, candidate),
    );

    return {
      category: toCategoryResolution(category),
      categoryCalculationMode: "oldest",
      categoryAgeBasis: oldestAge,
      resolvedCategoryExperienceLevels: category?.experienceLevels ?? [],
    };
  }

  const toleranceCategory = input.categories.find((candidate) => {
    const youngerCount = input.dancers.filter(
      (dancer) => dancer.ageAtEventStart < candidate.minAge,
    ).length;
    const olderCount = input.dancers.filter(
      (dancer) => dancer.ageAtEventStart > candidate.maxAge,
    ).length;

    return youngerCount === 0 && olderCount / input.dancers.length <= 0.2;
  });

  if (toleranceCategory) {
    return {
      category: {
        status: "resolved",
        id: toleranceCategory.id,
        name: toleranceCategory.name,
      },
      categoryCalculationMode: "group_tolerance",
      categoryAgeBasis: null,
      resolvedCategoryExperienceLevels: toleranceCategory.experienceLevels,
    };
  }

  const averageAge = Math.round(
    input.dancers.reduce((total, dancer) => total + dancer.ageAtEventStart, 0) /
      input.dancers.length,
  );
  const averageCategory = input.categories.find((candidate) =>
    isAgeWithinCategory(averageAge, candidate),
  );

  return {
    category: toCategoryResolution(averageCategory),
    categoryCalculationMode: "group_average",
    categoryAgeBasis: averageAge,
    resolvedCategoryExperienceLevels: averageCategory?.experienceLevels ?? [],
  };
}

function toCategoryResolution(
  category: CategoryCandidate | undefined,
): CategoryResolution {
  if (!category) {
    return { status: "pending", reason: "no-compatible-category" };
  }

  return {
    status: "resolved",
    id: category.id,
    name: category.name,
  };
}

function resolveExperienceLevel(input: {
  requiredExperienceLevels: ExperienceLevel[];
  category: CategoryResolution;
}): ExperienceLevelResolution {
  if (
    input.category.status !== "resolved" ||
    input.requiredExperienceLevels.length === 0
  ) {
    return {
      required: false,
      options: [],
    };
  }

  return {
    required: true,
    options: input.requiredExperienceLevels.map((level) => ({
      id: level,
      name: experienceLevelLabels[level] ?? level,
    })),
  };
}

function isAgeWithinCategory(
  age: number,
  category: { minAge: number; maxAge: number },
) {
  return category.minAge <= age && age <= category.maxAge;
}

export function getEventLocalDateParts(date: Date) {
  return getLocalDateParts(date, EVENT_TIME_ZONE);
}

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
  } satisfies LocalDateParts;
}

export function getAgeAtDate(birthDate: string, date: LocalDateParts) {
  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map((value) => Number(value));
  const hasHadBirthday =
    date.month > birthMonth ||
    (date.month === birthMonth && date.day >= birthDay);

  return date.year - birthYear - (hasHadBirthday ? 0 : 1);
}

/**
 * What a roster has to hold before a category can be read off it: people, each
 * of them once, and every one of them old enough and young enough for the
 * event. The three are one gate because they answer the same question —whether
 * these dancers can register at all— and no caller needs them apart.
 */
function validateResolvedDancers(
  dancers: ResolvedRegistrationDancer[],
): OperationFailure | null {
  const uniqueDancerIds = new Set(dancers.map((dancer) => dancer.id));

  if (dancers.length === 0 || uniqueDancerIds.size !== dancers.length) {
    return failure(
      "invalid-dancers",
      "Elegí uno o más bailarines válidos para resolver la coreografía.",
    );
  }

  const underageDancers = dancers.filter(
    (dancer) => !isOldEnoughAtEventStart(dancer.ageAtEventStart),
  );

  if (underageDancers.length > 0) {
    return failure(
      "dancer-under-minimum-age",
      getUnderageDancersMessage(underageDancers.map(getDancerFullName)),
    );
  }

  const overageDancers = dancers.filter(
    (dancer) => !isYoungEnoughAtEventStart(dancer.ageAtEventStart),
  );

  if (overageDancers.length > 0) {
    return failure(
      "dancer-over-maximum-age",
      getOverageDancersMessage(overageDancers.map(getDancerFullName)),
    );
  }

  return null;
}

function getDancerFullName(dancer: ResolvedRegistrationDancer) {
  return `${dancer.firstName} ${dancer.lastName}`;
}

function failure(
  code: ChoreographyRegistrationOperationFailureCode,
  error: string,
): OperationFailure {
  return {
    ok: false,
    code,
    error,
  };
}

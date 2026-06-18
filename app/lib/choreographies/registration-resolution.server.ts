import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { dancers, events } from "@/db/schema";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";
import {
  getEventBases,
  resolveEventBasesScheduleOptions,
  type CompatibleScheduleCapacity,
  type CompatibleScheduleCapacityResolution,
  type EventBases,
} from "@/lib/events/bases.server";
import { getEventRegistrationReadinessForBases } from "@/lib/events/registration-readiness.server";

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

type ExperienceLevelSummary = {
  id: string;
  name: string;
};

type ScheduleOptionSummary = Pick<
  CompatibleScheduleCapacity,
  "id" | "capacity" | "groupType"
> & {
  schedule: CompatibleScheduleCapacity["schedule"];
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
  experienceLevelIds: string[];
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
      options: ExperienceLevelSummary[];
    }
  | {
      required: false;
      options: ExperienceLevelSummary[];
    };

type ScheduleResolution =
  | {
      status: "none";
      canConfirm: false;
      error: string;
      options: [];
    }
  | {
      status: "auto";
      canConfirm: true;
      scheduleCapacityId: string;
      options: [ScheduleOptionSummary];
    }
  | {
      status: "multiple";
      canConfirm: true;
      options: ScheduleOptionSummary[];
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
  | "invalid-dancers";

type OperationFailure = {
  ok: false;
  code: ChoreographyRegistrationOperationFailureCode;
  error: string;
};

type OperationSuccess = {
  ok: true;
  resolution: ChoreographyRegistrationOperationResolution;
};

export type ChoreographyRegistrationOperationResult =
  | OperationFailure
  | OperationSuccess;

export async function resolveChoreographyRegistrationOperation(
  input: ChoreographyRegistrationOperationInput,
): Promise<ChoreographyRegistrationOperationResult> {
  const event = await db.query.events.findFirst({
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    return failure(
      "event-not-found",
      "No encontramos ese Evento para resolver el registro.",
    );
  }

  if (!event.active) {
    return failure(
      "event-not-active",
      "Solo podés registrar Coreografías en el Evento activo.",
    );
  }

  if (!isRegistrationWindowOpen(event, new Date())) {
    return failure(
      "registration-closed",
      "La inscripción del Evento activo no está abierta en este momento.",
    );
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
    skipReadinessCheck: true,
    submodalityId: input.submodalityId,
    dancers: input.dancers,
  });
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
      "Elegí uno o más Bailarines válidos para resolver la Coreografía.",
    );
  }

  const eventLocalStartDate = getLocalDateParts(
    input.event.startsAt,
    EVENT_TIME_ZONE,
  );
  const resolvedDancers = await resolveDancers({
    academyId: input.academyId,
    dancerIds: uniqueDancerIds,
    eventLocalStartDate,
  });

  if (!resolvedDancers) {
    return failure(
      "invalid-dancers",
      "Elegí Bailarines activos que pertenezcan a tu academia.",
    );
  }

  return await resolveRegistrationFromResolvedDancers({
    eventBases: input.eventBases,
    eventId: input.event.id,
    modalityId: input.modalityId,
    skipReadinessCheck: false,
    submodalityId: input.submodalityId,
    dancers: resolvedDancers,
  });
}

async function resolveRegistrationFromResolvedDancers(input: {
  eventBases: EventBases;
  eventId: string;
  modalityId: string;
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
        "El Evento activo todavía no tiene las bases mínimas para registrar Coreografías.",
      );
    }
  }

  const modality = input.eventBases.modalities.find(
    (record) => record.id === input.modalityId,
  );

  if (!modality) {
    return failure(
      "invalid-modality",
      "Elegí una Modalidad válida del Evento activo.",
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

  const uniqueDancerIds = new Set(input.dancers.map((dancer) => dancer.id));

  if (
    input.dancers.length === 0 ||
    uniqueDancerIds.size !== input.dancers.length
  ) {
    return failure(
      "invalid-dancers",
      "Elegí uno o más Bailarines válidos para resolver la Coreografía.",
    );
  }

  const groupType = deriveGroupType(input.dancers.length);
  const categoryCandidates = input.eventBases.categories
    .filter(
      (category) =>
        category.modalityIds.includes(modality.id) &&
        category.groupTypes.includes(groupType),
    )
    .map(toCategoryCandidate);

  const categoryResolution = resolveCategory({
    dancers: input.dancers,
    categories: categoryCandidates,
  });

  const experienceLevel = resolveExperienceLevel({
    availableLevels: input.eventBases.experienceLevels,
    requiredLevelIds: categoryResolution.resolvedCategoryExperienceLevelIds,
    category: categoryResolution.category,
  });

  const compatibleScheduleCapacities = await resolveEventBasesScheduleOptions({
    eventId: input.eventId,
    modalityId: modality.id,
    groupType,
  });
  const schedule = mapScheduleResolution(compatibleScheduleCapacities);

  return {
    ok: true,
    resolution: {
      groupType,
      category: categoryResolution.category,
      categoryCalculationMode: categoryResolution.categoryCalculationMode,
      categoryAgeBasis: categoryResolution.categoryAgeBasis,
      experienceLevel,
      schedule,
      dancers: input.dancers,
    },
  };
}

function deriveGroupType(dancerCount: number): GroupType {
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

function validateSubmodalitySelection(input: {
  availableSubmodalities: EventBases["submodalities"];
  submodalityId: string | null;
}): { ok: true } | { ok: false; failure: OperationFailure } {
  if (input.availableSubmodalities.length > 0 && input.submodalityId === null) {
    return {
      ok: false,
      failure: failure(
        "submodality-required",
        "Elegí una Submodalidad para la Modalidad seleccionada.",
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
        "Elegí una Submodalidad válida para la Modalidad seleccionada.",
      ),
    };
  }

  return { ok: true };
}

async function resolveDancers(input: {
  academyId: string;
  dancerIds: string[];
  eventLocalStartDate: LocalDateParts;
}): Promise<DancerAgeSummary[] | null> {
  const dancerRows = await db.query.dancers.findMany({
    where: and(
      eq(dancers.academyId, input.academyId),
      eq(dancers.active, true),
      inArray(dancers.id, input.dancerIds),
    ),
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
    },
  });

  if (dancerRows.length !== input.dancerIds.length) {
    return null;
  }

  const dancerById = new Map(dancerRows.map((dancer) => [dancer.id, dancer]));

  return input.dancerIds.map((dancerId) => {
    const dancer = dancerById.get(dancerId);

    if (!dancer) {
      throw new Error("Expected dancer to be present after validation.");
    }

    return {
      id: dancer.id,
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      ageAtEventStart: getAgeAtDate(
        dancer.birthDate,
        input.eventLocalStartDate,
      ),
    };
  });
}

function toCategoryCandidate(
  category: EventBases["categories"][number],
): CategoryCandidate {
  return {
    id: category.id,
    name: category.name,
    minAge: category.minAge,
    maxAge: category.maxAge,
    experienceLevelIds: category.experienceLevelIds,
  };
}

function resolveCategory(input: {
  dancers: DancerAgeSummary[];
  categories: CategoryCandidate[];
}): {
  category: CategoryResolution;
  categoryCalculationMode: CategoryCalculationMode;
  categoryAgeBasis: number | null;
  resolvedCategoryExperienceLevelIds: string[];
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
      resolvedCategoryExperienceLevelIds: category?.experienceLevelIds ?? [],
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
      resolvedCategoryExperienceLevelIds: toleranceCategory.experienceLevelIds,
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
    resolvedCategoryExperienceLevelIds:
      averageCategory?.experienceLevelIds ?? [],
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
  availableLevels: EventBases["experienceLevels"];
  requiredLevelIds: string[];
  category: CategoryResolution;
}): ExperienceLevelResolution {
  if (
    input.category.status !== "resolved" ||
    input.requiredLevelIds.length === 0
  ) {
    return {
      required: false,
      options: [],
    };
  }

  return {
    required: true,
    options: input.availableLevels
      .filter((level) => input.requiredLevelIds.includes(level.id))
      .map((level) => ({
        id: level.id,
        name: level.name,
      })),
  };
}

function isAgeWithinCategory(
  age: number,
  category: { minAge: number; maxAge: number },
) {
  return category.minAge <= age && age <= category.maxAge;
}

function mapScheduleResolution(
  scheduleResolution: CompatibleScheduleCapacityResolution,
): ScheduleResolution {
  if (scheduleResolution.status === "none") {
    return {
      status: "none",
      canConfirm: false,
      error: scheduleResolution.error,
      options: [],
    };
  }

  if (scheduleResolution.status === "auto") {
    return {
      status: "auto",
      canConfirm: true,
      scheduleCapacityId: scheduleResolution.scheduleCapacity.id,
      options: [toScheduleOptionSummary(scheduleResolution.scheduleCapacity)],
    };
  }

  return {
    status: "multiple",
    canConfirm: true,
    options: scheduleResolution.options.map(toScheduleOptionSummary),
  };
}

function toScheduleOptionSummary(
  option: CompatibleScheduleCapacity,
): ScheduleOptionSummary {
  return {
    id: option.id,
    capacity: option.capacity,
    groupType: option.groupType,
    schedule: option.schedule,
  };
}

function isRegistrationWindowOpen(
  event: Pick<
    typeof events.$inferSelect,
    "registrationStartsAt" | "registrationEndsAt"
  >,
  now: Date,
) {
  return event.registrationStartsAt <= now && now <= event.registrationEndsAt;
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

function getAgeAtDate(birthDate: string, date: LocalDateParts) {
  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map((value) => Number(value));
  const hasHadBirthday =
    date.month > birthMonth ||
    (date.month === birthMonth && date.day >= birthDay);

  return date.year - birthYear - (hasHadBirthday ? 0 : 1);
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

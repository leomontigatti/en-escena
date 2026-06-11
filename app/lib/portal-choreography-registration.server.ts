import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { dancers, events } from "@/db/schema";
import type { CompatibleScheduleEntry } from "@/lib/admin-catalogs.server";
import {
  listEventCatalogs,
  resolveCompatibleScheduleEntries,
} from "@/lib/admin-catalogs.server";
import { getEventRegistrationReadiness } from "@/lib/event-registration-readiness.server";

const EVENT_TIME_ZONE = "America/Argentina/Cordoba";

type GroupType = "solo" | "duo" | "trio" | "grupal";
type CategoryCalculationMode = "oldest" | "group_tolerance" | "group_average";
type ChoreographyRegistrationOperationInput = {
  academyId: string;
  eventId: string;
  modalityId: string;
  submodalityId: string | null;
  dancerIds: string[];
};

type CategorySummary = {
  id: string;
  name: string;
};

type ExperienceLevelSummary = {
  id: string;
  name: string;
};

type ScheduleOptionSummary = Pick<
  CompatibleScheduleEntry,
  "id" | "capacity" | "groupTypes" | "groupTypeKey"
> & {
  scheduleBlock: CompatibleScheduleEntry["scheduleBlock"];
};

type DancerAgeSummary = {
  id: string;
  firstName: string;
  lastName: string;
  ageAtEventStart: number;
};

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
      scheduleEntryId: string;
      options: [ScheduleOptionSummary];
    }
  | {
      status: "multiple";
      canConfirm: true;
      options: ScheduleOptionSummary[];
    };

type OperationResolution = {
  groupType: GroupType;
  category: CategoryResolution;
  categoryCalculationMode: CategoryCalculationMode;
  categoryAgeBasis: number | null;
  experienceLevel: ExperienceLevelResolution;
  schedule: ScheduleResolution;
  dancers: DancerAgeSummary[];
};

type OperationFailureCode =
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
  code: OperationFailureCode;
  error: string;
};

type OperationSuccess = {
  ok: true;
  resolution: OperationResolution;
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

  const [readiness, catalogs] = await Promise.all([
    getEventRegistrationReadiness(event.id),
    listEventCatalogs(event.id),
  ]);

  if (!readiness.isReady) {
    return failure(
      "event-not-ready",
      "El Evento activo todavía no tiene la configuración mínima para registrar Coreografías.",
    );
  }

  const modality = catalogs.modalities.find(
    (record) => record.id === input.modalityId,
  );

  if (!modality) {
    return failure(
      "invalid-modality",
      "Elegí una Modalidad válida del Evento activo.",
    );
  }

  const modalitySubmodalities = catalogs.submodalities.filter(
    (record) => record.modalityId === modality.id,
  );
  const submodalityValidation = validateSubmodalitySelection({
    availableSubmodalities: modalitySubmodalities,
    submodalityId: input.submodalityId,
  });

  if (!submodalityValidation.ok) {
    return submodalityValidation.failure;
  }

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
    event.startsAt,
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

  const groupType = deriveGroupType(resolvedDancers.length);
  const categoryCandidates = catalogs.categories
    .filter(
      (category) =>
        category.modalityIds.includes(modality.id) &&
        category.groupTypes.includes(groupType),
    )
    .map(toCategoryCandidate);

  const categoryResolution = resolveCategory({
    dancers: resolvedDancers,
    categories: categoryCandidates,
  });

  const experienceLevel = resolveExperienceLevel({
    availableLevels: catalogs.experienceLevels,
    requiredLevelIds: categoryResolution.resolvedCategoryExperienceLevelIds,
    category: categoryResolution.category,
  });

  const compatibleScheduleEntries = await resolveCompatibleScheduleEntries({
    eventId: event.id,
    modalityId: modality.id,
    groupType,
  });
  const schedule = mapScheduleResolution(compatibleScheduleEntries);

  return {
    ok: true,
    resolution: {
      groupType,
      category: categoryResolution.category,
      categoryCalculationMode: categoryResolution.categoryCalculationMode,
      categoryAgeBasis: categoryResolution.categoryAgeBasis,
      experienceLevel,
      schedule,
      dancers: resolvedDancers,
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
  availableSubmodalities: Awaited<
    ReturnType<typeof listEventCatalogs>
  >["submodalities"];
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
  category: Awaited<ReturnType<typeof listEventCatalogs>>["categories"][number],
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
  availableLevels: Awaited<
    ReturnType<typeof listEventCatalogs>
  >["experienceLevels"];
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
  scheduleResolution: Awaited<
    ReturnType<typeof resolveCompatibleScheduleEntries>
  >,
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
      scheduleEntryId: scheduleResolution.scheduleEntry.id,
      options: [toScheduleOptionSummary(scheduleResolution.scheduleEntry)],
    };
  }

  return {
    status: "multiple",
    canConfirm: true,
    options: scheduleResolution.options.map(toScheduleOptionSummary),
  };
}

function toScheduleOptionSummary(
  option: CompatibleScheduleEntry,
): ScheduleOptionSummary {
  return {
    id: option.id,
    capacity: option.capacity,
    groupTypes: option.groupTypes,
    groupTypeKey: option.groupTypeKey,
    scheduleBlock: option.scheduleBlock,
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

function failure(code: OperationFailureCode, error: string): OperationFailure {
  return {
    ok: false,
    code,
    error,
  };
}

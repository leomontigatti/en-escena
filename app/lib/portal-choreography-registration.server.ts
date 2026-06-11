import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  professors,
  scheduleEntries,
} from "@/db/schema";
import type { CompatibleScheduleEntry } from "@/lib/admin-catalogs.server";
import {
  listEventCatalogs,
  resolveCompatibleScheduleEntries,
} from "@/lib/admin-catalogs.server";
import { getEventRegistrationReadiness } from "@/lib/event-registration-readiness.server";

const EVENT_TIME_ZONE = "America/Argentina/Cordoba";
const INVALID_EXPERIENCE_LEVEL_ERROR =
  "Elegí un Nivel de experiencia válido para confirmar la Coreografía.";
const INVALID_SCHEDULE_ENTRY_ERROR =
  "Elegí un Cronograma compatible para confirmar la Coreografía.";
const choreographyTitleCaseParticles = new Set([
  "a",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "y",
]);

type GroupType = "solo" | "duo" | "trio" | "grupal";
type CategoryCalculationMode = "oldest" | "group_tolerance" | "group_average";
type ChoreographyRegistrationOperationInput = {
  academyId: string;
  eventId: string;
  modalityId: string;
  submodalityId: string | null;
  dancerIds: string[];
};

type CreateChoreographyRegistrationInput =
  ChoreographyRegistrationOperationInput & {
    name: string;
    professorIds: string[];
    experienceLevelId: string | null;
    scheduleEntryId: string;
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

type CreateChoreographyRegistrationFailureCode =
  | OperationFailureCode
  | "invalid-name"
  | "invalid-professors"
  | "invalid-experience-level"
  | "invalid-schedule-entry"
  | "schedule-entry-full";

type CreateChoreographyRegistrationFailure = {
  ok: false;
  code: CreateChoreographyRegistrationFailureCode;
  error: string;
};

type CreateChoreographyRegistrationSuccess = {
  ok: true;
  choreography: typeof choreographies.$inferSelect;
};

export type CreateChoreographyRegistrationResult =
  | CreateChoreographyRegistrationFailure
  | CreateChoreographyRegistrationSuccess;

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

export async function createChoreographyRegistration(
  input: CreateChoreographyRegistrationInput,
): Promise<CreateChoreographyRegistrationResult> {
  const normalizedName = normalizeChoreographyName(input.name);

  if (!normalizedName.ok) {
    return normalizedName.failure;
  }

  const uniqueProfessorIds = [...new Set(input.professorIds)];

  if (uniqueProfessorIds.length !== input.professorIds.length) {
    return createFailure(
      "invalid-professors",
      "Elegí Profesores válidos sin repetirlos en la misma Coreografía.",
    );
  }

  const operation = await resolveChoreographyRegistrationOperation({
    academyId: input.academyId,
    eventId: input.eventId,
    modalityId: input.modalityId,
    submodalityId: input.submodalityId,
    dancerIds: input.dancerIds,
  });

  if (!operation.ok) {
    return operation;
  }

  const experienceLevelId = resolveSelectedExperienceLevelId({
    resolution: operation.resolution,
    experienceLevelId: input.experienceLevelId,
  });

  if (!experienceLevelId.ok) {
    return experienceLevelId.failure;
  }

  const scheduleEntryId = resolveSelectedScheduleEntryId({
    resolution: operation.resolution,
    scheduleEntryId: input.scheduleEntryId,
  });

  if (!scheduleEntryId.ok) {
    return scheduleEntryId.failure;
  }

  const validProfessorIds = await resolveProfessorIds({
    academyId: input.academyId,
    professorIds: uniqueProfessorIds,
  });

  if (!validProfessorIds.ok) {
    return validProfessorIds.failure;
  }

  let choreography: typeof choreographies.$inferSelect;

  try {
    choreography = await db.transaction(async (tx) => {
      const [lockedScheduleEntry] = await tx
        .select({
          id: scheduleEntries.id,
          capacity: scheduleEntries.capacity,
        })
        .from(scheduleEntries)
        .where(eq(scheduleEntries.id, scheduleEntryId.value))
        .for("update");

      if (!lockedScheduleEntry) {
        throw createFailure(
          "invalid-schedule-entry",
          INVALID_SCHEDULE_ENTRY_ERROR,
        );
      }

      const [occupancyRow] = await tx
        .select({
          occupiedCount: sql<number>`count(*)`,
        })
        .from(choreographies)
        .where(eq(choreographies.scheduleEntryId, lockedScheduleEntry.id));

      const occupiedCount = Number(occupancyRow?.occupiedCount ?? 0);

      if (occupiedCount >= lockedScheduleEntry.capacity) {
        throw createFailure(
          "schedule-entry-full",
          "El Cronograma seleccionado ya no tiene cupo disponible.",
        );
      }

      const [createdChoreography] = await tx
        .insert(choreographies)
        .values({
          eventId: input.eventId,
          academyId: input.academyId,
          name: normalizedName.value,
          modalityId: input.modalityId,
          submodalityId: input.submodalityId,
          groupType: operation.resolution.groupType,
          categoryId:
            operation.resolution.category.status === "resolved"
              ? operation.resolution.category.id
              : null,
          categoryCalculationMode: operation.resolution.categoryCalculationMode,
          categoryAgeBasis: operation.resolution.categoryAgeBasis,
          experienceLevelId: experienceLevelId.value,
          scheduleEntryId: lockedScheduleEntry.id,
        })
        .returning();

      await tx.insert(choreographyDancers).values(
        operation.resolution.dancers.map((dancer) => ({
          choreographyId: createdChoreography.id,
          dancerId: dancer.id,
          ageAtEventStart: dancer.ageAtEventStart,
        })),
      );

      if (validProfessorIds.professorIds.length > 0) {
        await tx.insert(choreographyProfessors).values(
          validProfessorIds.professorIds.map((professorId) => ({
            choreographyId: createdChoreography.id,
            professorId,
          })),
        );
      }

      return createdChoreography;
    });
  } catch (error) {
    if (isCreateChoreographyRegistrationFailure(error)) {
      return error;
    }

    throw error;
  }

  return {
    ok: true,
    choreography,
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

function normalizeChoreographyName(
  value: string,
):
  | { ok: true; value: string }
  | { ok: false; failure: CreateChoreographyRegistrationFailure } {
  const normalizedValue = collapseWhitespace(value);

  if (normalizedValue.length === 0) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-name",
        "Ingresá el nombre de la Coreografía.",
      ),
    };
  }

  if (normalizedValue.length > 120) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-name",
        "El nombre de la Coreografía no puede superar los 120 caracteres.",
      ),
    };
  }

  return {
    ok: true,
    value: toChoreographyTitleCase(normalizedValue),
  };
}

function toChoreographyTitleCase(value: string) {
  return value
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word, index) => {
      const lowerWord = word.toLocaleLowerCase("es-AR");

      if (index > 0 && choreographyTitleCaseParticles.has(lowerWord)) {
        return lowerWord;
      }

      return lowerWord
        .split("-")
        .map((part) => capitalizeFirstCharacter(part))
        .join("-");
    })
    .join(" ");
}

function capitalizeFirstCharacter(value: string) {
  const [firstCharacter, ...rest] = Array.from(value);

  if (!firstCharacter) {
    return value;
  }

  return `${firstCharacter.toLocaleUpperCase("es-AR")}${rest.join("")}`;
}

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

async function resolveProfessorIds(input: {
  academyId: string;
  professorIds: string[];
}): Promise<
  | { ok: true; professorIds: string[] }
  | { ok: false; failure: CreateChoreographyRegistrationFailure }
> {
  if (input.professorIds.length === 0) {
    return { ok: true, professorIds: [] };
  }

  const professorRows = await db.query.professors.findMany({
    where: and(
      eq(professors.academyId, input.academyId),
      eq(professors.active, true),
      inArray(professors.id, input.professorIds),
    ),
    columns: {
      id: true,
    },
  });

  if (professorRows.length !== input.professorIds.length) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-professors",
        "Elegí Profesores activos que pertenezcan a tu academia.",
      ),
    };
  }

  return { ok: true, professorIds: input.professorIds };
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

function resolveSelectedExperienceLevelId(input: {
  resolution: OperationResolution;
  experienceLevelId: string | null;
}):
  | { ok: true; value: string | null }
  | { ok: false; failure: CreateChoreographyRegistrationFailure } {
  if (!input.resolution.experienceLevel.required) {
    return { ok: true, value: null };
  }

  if (!input.experienceLevelId) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-experience-level",
        INVALID_EXPERIENCE_LEVEL_ERROR,
      ),
    };
  }

  const isValidLevel = input.resolution.experienceLevel.options.some(
    (option) => option.id === input.experienceLevelId,
  );

  if (!isValidLevel) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-experience-level",
        INVALID_EXPERIENCE_LEVEL_ERROR,
      ),
    };
  }

  return { ok: true, value: input.experienceLevelId };
}

function resolveSelectedScheduleEntryId(input: {
  resolution: OperationResolution;
  scheduleEntryId: string;
}):
  | { ok: true; value: string }
  | { ok: false; failure: CreateChoreographyRegistrationFailure } {
  if (input.resolution.schedule.status === "none") {
    return {
      ok: false,
      failure: createFailure(
        "invalid-schedule-entry",
        input.resolution.schedule.error,
      ),
    };
  }

  if (input.resolution.schedule.status === "auto") {
    if (input.scheduleEntryId !== input.resolution.schedule.scheduleEntryId) {
      return {
        ok: false,
        failure: createFailure(
          "invalid-schedule-entry",
          INVALID_SCHEDULE_ENTRY_ERROR,
        ),
      };
    }

    return { ok: true, value: input.resolution.schedule.scheduleEntryId };
  }

  const isValidOption = input.resolution.schedule.options.some(
    (option) => option.id === input.scheduleEntryId,
  );

  if (!isValidOption) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-schedule-entry",
        INVALID_SCHEDULE_ENTRY_ERROR,
      ),
    };
  }

  return { ok: true, value: input.scheduleEntryId };
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

function createFailure(
  code: CreateChoreographyRegistrationFailureCode,
  error: string,
): CreateChoreographyRegistrationFailure {
  return {
    ok: false,
    code,
    error,
  };
}

function isCreateChoreographyRegistrationFailure(
  value: unknown,
): value is CreateChoreographyRegistrationFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "code" in value &&
    "error" in value &&
    (value as CreateChoreographyRegistrationFailure).ok === false
  );
}

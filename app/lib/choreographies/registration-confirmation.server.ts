import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  professors,
  schedules,
  scheduleCapacities,
} from "@/db/schema";
import {
  choreographyNameMaxLength,
  collapseChoreographyNameWhitespace,
  hasChoreographyNameContent,
  invalidChoreographyNameMessage,
} from "@/lib/choreographies/choreography-name";
import {
  resolveChoreographyRegistrationOperation,
  type ChoreographyRegistrationOperationFailureCode,
  type ChoreographyRegistrationOperationInput,
  type ChoreographyRegistrationOperationResolution,
} from "@/lib/choreographies/registration-resolution.server";
import {
  type ExperienceLevel,
  isExperienceLevel,
} from "@/lib/events/experience-levels";

const INVALID_EXPERIENCE_LEVEL_ERROR =
  "Elegí un nivel de experiencia válido para confirmar la coreografía.";
const INVALID_SCHEDULE_ENTRY_ERROR =
  "Elegí un cupo de cronograma compatible para confirmar la coreografía.";
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

type CreateChoreographyRegistrationInput =
  ChoreographyRegistrationOperationInput & {
    name: string;
    professorIds: string[];
    experienceLevelId: string | null;
    scheduleCapacityId: string;
  };

type CreateChoreographyRegistrationFailureCode =
  | ChoreographyRegistrationOperationFailureCode
  | "invalid-name"
  | "invalid-professors"
  | "invalid-experience-level"
  | "invalid-schedule-capacity"
  | "schedule-capacity-full";

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

export async function createChoreographyRegistration(
  input: CreateChoreographyRegistrationInput,
): Promise<CreateChoreographyRegistrationResult> {
  const normalizedName = normalizeChoreographyName(input.name);

  if (!normalizedName.ok) {
    return normalizedName.failure;
  }

  const uniqueProfessorIds = [...new Set(input.professorIds)];

  if (uniqueProfessorIds.length === 0) {
    return createFailure(
      "invalid-professors",
      "Elegí uno o más profesores válidos para la coreografía.",
    );
  }

  if (uniqueProfessorIds.length !== input.professorIds.length) {
    return createFailure(
      "invalid-professors",
      "Elegí profesores válidos sin repetirlos en la misma coreografía.",
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

  const scheduleSelection = resolveSelectedScheduleSelection({
    resolution: operation.resolution,
    scheduleCapacityId: input.scheduleCapacityId,
  });

  if (!scheduleSelection.ok) {
    return scheduleSelection.failure;
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
      const [lockedSchedule] = await tx
        .select({
          id: schedules.id,
          totalCapacity: schedules.totalCapacity,
        })
        .from(schedules)
        .where(eq(schedules.id, scheduleSelection.value.scheduleId))
        .for("update");

      if (!lockedSchedule) {
        throw createFailure(
          "invalid-schedule-capacity",
          INVALID_SCHEDULE_ENTRY_ERROR,
        );
      }

      if (scheduleSelection.value.scheduleCapacityId) {
        const [lockedScheduleCapacity] = await tx
          .select({
            id: scheduleCapacities.id,
            capacity: scheduleCapacities.capacity,
          })
          .from(scheduleCapacities)
          .where(
            eq(
              scheduleCapacities.id,
              scheduleSelection.value.scheduleCapacityId,
            ),
          )
          .for("update");

        if (!lockedScheduleCapacity) {
          throw createFailure(
            "invalid-schedule-capacity",
            INVALID_SCHEDULE_ENTRY_ERROR,
          );
        }

        const [specificOccupancyRow] = await tx
          .select({
            occupiedCount: sql<number>`count(*)`,
          })
          .from(choreographies)
          .where(
            eq(choreographies.scheduleCapacityId, lockedScheduleCapacity.id),
          );

        const specificOccupiedCount = Number(
          specificOccupancyRow?.occupiedCount ?? 0,
        );

        if (specificOccupiedCount >= lockedScheduleCapacity.capacity) {
          throw createFailure(
            "schedule-capacity-full",
            "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
          );
        }
      }

      const [scheduleOccupancyRow] = await tx
        .select({
          occupiedCount: sql<number>`count(*)`,
        })
        .from(choreographies)
        .leftJoin(
          scheduleCapacities,
          eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
        )
        .where(
          or(
            eq(choreographies.scheduleId, lockedSchedule.id),
            eq(scheduleCapacities.scheduleId, lockedSchedule.id),
          ),
        );

      const scheduleOccupiedCount = Number(
        scheduleOccupancyRow?.occupiedCount ?? 0,
      );

      if (scheduleOccupiedCount >= lockedSchedule.totalCapacity) {
        throw createFailure(
          "schedule-capacity-full",
          "El cronograma seleccionado ya no tiene cupo disponible.",
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
          scheduleId: lockedSchedule.id,
          scheduleCapacityId: scheduleSelection.value.scheduleCapacityId,
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

function normalizeChoreographyName(
  value: string,
):
  | { ok: true; value: string }
  | { ok: false; failure: CreateChoreographyRegistrationFailure } {
  const normalizedValue = collapseChoreographyNameWhitespace(value);

  if (normalizedValue.length === 0) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-name",
        "Ingresá el nombre de la coreografía.",
      ),
    };
  }

  if (!hasChoreographyNameContent(normalizedValue)) {
    return {
      ok: false,
      failure: createFailure("invalid-name", invalidChoreographyNameMessage),
    };
  }

  if (normalizedValue.length > choreographyNameMaxLength) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-name",
        "El nombre de la coreografía no puede superar los 120 caracteres.",
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
        "Elegí profesores activos que pertenezcan a tu academia.",
      ),
    };
  }

  return { ok: true, professorIds: input.professorIds };
}

function resolveSelectedExperienceLevelId(input: {
  resolution: ChoreographyRegistrationOperationResolution;
  experienceLevelId: string | null;
}):
  | { ok: true; value: ExperienceLevel | null }
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

  if (!isExperienceLevel(input.experienceLevelId)) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-experience-level",
        INVALID_EXPERIENCE_LEVEL_ERROR,
      ),
    };
  }

  const isAllowedLevel = input.resolution.experienceLevel.options.some(
    (option) => option.id === input.experienceLevelId,
  );

  if (!isAllowedLevel) {
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

function resolveSelectedScheduleSelection(input: {
  resolution: ChoreographyRegistrationOperationResolution;
  scheduleCapacityId: string;
}):
  | {
      ok: true;
      value: {
        scheduleId: string;
        scheduleCapacityId: string | null;
      };
    }
  | { ok: false; failure: CreateChoreographyRegistrationFailure } {
  if (input.resolution.schedule.status === "none") {
    return {
      ok: false,
      failure: createFailure(
        "invalid-schedule-capacity",
        input.resolution.schedule.error,
      ),
    };
  }

  if (input.resolution.schedule.status === "auto") {
    if (
      input.scheduleCapacityId !== input.resolution.schedule.scheduleCapacityId
    ) {
      return {
        ok: false,
        failure: createFailure(
          "invalid-schedule-capacity",
          INVALID_SCHEDULE_ENTRY_ERROR,
        ),
      };
    }

    const [option] = input.resolution.schedule.options;

    return {
      ok: true,
      value: {
        scheduleId: option.scheduleId,
        scheduleCapacityId: option.scheduleCapacityId,
      },
    };
  }

  const selectedOption = input.resolution.schedule.options.find(
    (option) => option.id === input.scheduleCapacityId,
  );

  if (!selectedOption) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-schedule-capacity",
        INVALID_SCHEDULE_ENTRY_ERROR,
      ),
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

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  professors,
  scheduleCapacities,
} from "@/db/schema";
import {
  resolveChoreographyRegistrationOperation,
  type ChoreographyRegistrationOperationFailureCode,
  type ChoreographyRegistrationOperationInput,
  type ChoreographyRegistrationOperationResolution,
} from "@/lib/choreographies/registration-resolution.server";

const INVALID_EXPERIENCE_LEVEL_ERROR =
  "Elegí un Nivel de experiencia válido para confirmar la Coreografía.";
const INVALID_SCHEDULE_ENTRY_ERROR =
  "Elegí un Cupo de cronograma compatible para confirmar la Coreografía.";
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

  const scheduleCapacityId = resolveSelectedScheduleCapacityId({
    resolution: operation.resolution,
    scheduleCapacityId: input.scheduleCapacityId,
  });

  if (!scheduleCapacityId.ok) {
    return scheduleCapacityId.failure;
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
      const [lockedScheduleCapacity] = await tx
        .select({
          id: scheduleCapacities.id,
          capacity: scheduleCapacities.capacity,
        })
        .from(scheduleCapacities)
        .where(eq(scheduleCapacities.id, scheduleCapacityId.value))
        .for("update");

      if (!lockedScheduleCapacity) {
        throw createFailure(
          "invalid-schedule-capacity",
          INVALID_SCHEDULE_ENTRY_ERROR,
        );
      }

      const [occupancyRow] = await tx
        .select({
          occupiedCount: sql<number>`count(*)`,
        })
        .from(choreographies)
        .where(
          eq(choreographies.scheduleCapacityId, lockedScheduleCapacity.id),
        );

      const occupiedCount = Number(occupancyRow?.occupiedCount ?? 0);

      if (occupiedCount >= lockedScheduleCapacity.capacity) {
        throw createFailure(
          "schedule-capacity-full",
          "El Cupo de cronograma seleccionado ya no tiene cupo disponible.",
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
          scheduleCapacityId: lockedScheduleCapacity.id,
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

function resolveSelectedExperienceLevelId(input: {
  resolution: ChoreographyRegistrationOperationResolution;
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

function resolveSelectedScheduleCapacityId(input: {
  resolution: ChoreographyRegistrationOperationResolution;
  scheduleCapacityId: string;
}):
  | { ok: true; value: string }
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

    return { ok: true, value: input.resolution.schedule.scheduleCapacityId };
  }

  const isValidOption = input.resolution.schedule.options.some(
    (option) => option.id === input.scheduleCapacityId,
  );

  if (!isValidOption) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-schedule-capacity",
        INVALID_SCHEDULE_ENTRY_ERROR,
      ),
    };
  }

  return { ok: true, value: input.scheduleCapacityId };
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

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  modalities,
  professors,
} from "@/db/schema";
import { allocateChoreographyNumber } from "@/lib/choreographies/choreography-number.server";
import {
  getDuplicateChoreographyMessage,
  type ChoreographyCastMatch,
  type ChoreographyCastWarning,
} from "@/lib/choreographies/choreography-duplicates";
import { matchesToWarnAbout } from "@/lib/shared/duplicate-warning";
import { normalizedTextEquals } from "@/lib/shared/text-normalization.server";
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
  getNoCompatibleCategoryRegistrationMessage,
  invalidExperienceLevelMessage,
} from "@/lib/choreographies/choreography-messages";
import {
  classifyRosterPersonSelection,
  getRosterPersonRejectionMessage,
  noLinkedRosterPeople,
} from "@/lib/roster/roster-person-rejection";
import {
  invalidScheduleEntryMessage,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  type ExperienceLevel,
  isExperienceLevel,
} from "@/lib/events/experience-levels";

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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreateChoreographyRegistrationInput =
  ChoreographyRegistrationOperationInput & {
    acknowledgedDuplicateIds?: readonly string[];
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

type CreateChoreographyRegistrationErrorFailure = {
  ok: false;
  code: CreateChoreographyRegistrationFailureCode;
  error: string;
};

/**
 * The one failure the wizard renders as a warning: the piece is registrable, it
 * just looks like one the academy already registered, so the refusal carries
 * what it found and the same submit continues once those ids come back.
 */
type CreateChoreographyDuplicateFailure = {
  ok: false;
  code: "duplicate-choreography";
  error: string;
  warning: ChoreographyCastWarning;
};

type CreateChoreographyRegistrationFailure =
  | CreateChoreographyRegistrationErrorFailure
  | CreateChoreographyDuplicateFailure;

type CreateChoreographyRegistrationSuccess = {
  ok: true;
  choreography: typeof choreographies.$inferSelect;
};

export type CreateChoreographyRegistrationResult =
  CreateChoreographyRegistrationFailure | CreateChoreographyRegistrationSuccess;

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

  // Beside the schedule check and before anything is written: a choreography
  // that resolves to no category cannot compete, so it is never inserted. The
  // resolver still reports the category as pending — turning that into a
  // refusal is the writer's call, not the resolver's.
  const { category } = operation.resolution;

  if (category.status !== "resolved") {
    return createFailure(
      "no-compatible-category",
      getNoCompatibleCategoryRegistrationMessage({
        modalityName: await getModalityName(input.modalityId),
        groupType: operation.resolution.groupType,
      }),
    );
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
      const scheduleLock = await lockScheduleCapacityForAssignment({
        tx,
        scheduleId: scheduleSelection.value.scheduleId,
        scheduleCapacityId: scheduleSelection.value.scheduleCapacityId,
      });

      if (!scheduleLock.ok) {
        throw createFailure(scheduleLock.code, scheduleLock.error);
      }

      // Inside the transaction and before the number is taken: a warning must
      // leave the event's counter where it was, so a piece the academy decides
      // not to register does not burn a number.
      const castMatches = matchesToWarnAbout(
        await findSameCastChoreographies({
          tx,
          academyId: input.academyId,
          eventId: input.eventId,
          name: normalizedName.value,
          dancerIds: operation.resolution.dancers.map((dancer) => dancer.id),
        }),
        input.acknowledgedDuplicateIds ?? [],
      );

      if (castMatches.length > 0) {
        throw createDuplicateFailure(castMatches);
      }

      // After the capacity lock, never before. The counter is a single row per
      // event that every registration goes through, so it is held for the
      // shortest window possible. No other transaction takes both rows today;
      // keeping this one order is what stops a future one from meeting this
      // one head on.
      const choreographyNumber = await allocateChoreographyNumber({
        tx,
        eventId: input.eventId,
      });

      const [createdChoreography] = await tx
        .insert(choreographies)
        .values({
          eventId: input.eventId,
          academyId: input.academyId,
          choreographyNumber,
          name: normalizedName.value,
          modalityId: input.modalityId,
          submodalityId: input.submodalityId,
          groupType: operation.resolution.groupType,
          categoryId: category.id,
          categoryCalculationMode: operation.resolution.categoryCalculationMode,
          categoryAgeBasis: operation.resolution.categoryAgeBasis,
          experienceLevelId: experienceLevelId.value,
          scheduleId: scheduleLock.scheduleId,
          scheduleCapacityId: scheduleLock.scheduleCapacityId,
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

/**
 * Only the refusal needs it: the resolver already validated the modality, so
 * the name is read on the one path that puts it in front of the academy.
 */
async function getModalityName(modalityId: string) {
  const modality = await db.query.modalities.findFirst({
    where: eq(modalities.id, modalityId),
    columns: { name: true },
  });

  return modality?.name ?? null;
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
      inArray(professors.id, input.professorIds),
    ),
    columns: {
      id: true,
      active: true,
    },
  });

  const selection = classifyRosterPersonSelection({
    selectedIds: input.professorIds,
    rows: professorRows,
    linkedPersonIds: noLinkedRosterPeople,
  });

  if (selection.rejections.length > 0) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-professors",
        getRosterPersonRejectionMessage({
          kind: "professor",
          rejections: selection.rejections,
        }),
      ),
    };
  }

  return {
    ok: true,
    professorIds: selection.people.map((professor) => professor.id),
  };
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
        invalidExperienceLevelMessage,
      ),
    };
  }

  if (!isExperienceLevel(input.experienceLevelId)) {
    return {
      ok: false,
      failure: createFailure(
        "invalid-experience-level",
        invalidExperienceLevelMessage,
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
        invalidExperienceLevelMessage,
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
          invalidScheduleEntryMessage,
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
        invalidScheduleEntryMessage,
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

/**
 * Same name and same cast, in the same academy and the same event: name alone
 * would refuse two solos of different dancers dancing a piece with the same
 * name, which production is full of, and cast alone would refuse a second piece
 * by the same group, which is the normal case.
 */
async function findSameCastChoreographies(input: {
  tx: Transaction;
  academyId: string;
  eventId: string;
  name: string;
  dancerIds: string[];
}): Promise<ChoreographyCastMatch[]> {
  const candidates = await input.tx
    .select({
      choreographyNumber: choreographies.choreographyNumber,
      id: choreographies.id,
      name: choreographies.name,
    })
    .from(choreographies)
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
        isNull(choreographies.withdrawnAt),
        normalizedTextEquals(choreographies.name, input.name),
      ),
    );

  if (candidates.length === 0) {
    return [];
  }

  const rosterRows = await input.tx
    .select({
      choreographyId: choreographyDancers.choreographyId,
      dancerId: choreographyDancers.dancerId,
    })
    .from(choreographyDancers)
    .where(
      and(
        inArray(
          choreographyDancers.choreographyId,
          candidates.map((candidate) => candidate.id),
        ),
        isNull(choreographyDancers.withdrawnAt),
      ),
    );

  const castByChoreographyId = new Map<string, Set<string>>();

  for (const row of rosterRows) {
    const cast = castByChoreographyId.get(row.choreographyId) ?? new Set();
    cast.add(row.dancerId);
    castByChoreographyId.set(row.choreographyId, cast);
  }

  const newCast = new Set(input.dancerIds);

  return candidates.filter((candidate) =>
    isSameCast(castByChoreographyId.get(candidate.id) ?? new Set(), newCast),
  );
}

function isSameCast(cast: Set<string>, otherCast: Set<string>) {
  return (
    cast.size === otherCast.size &&
    [...cast].every((dancerId) => otherCast.has(dancerId))
  );
}

function createDuplicateFailure(
  matches: ChoreographyCastMatch[],
): CreateChoreographyDuplicateFailure {
  return {
    ok: false,
    code: "duplicate-choreography",
    error: getDuplicateChoreographyMessage(matches),
    warning: { kind: "choreography-cast", matches },
  };
}

function createFailure(
  code: CreateChoreographyRegistrationFailureCode,
  error: string,
): CreateChoreographyRegistrationErrorFailure {
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

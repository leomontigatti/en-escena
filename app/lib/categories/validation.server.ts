import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, categoryModalities, modalities } from "@/db/schema";
import {
  eventBaseCollision,
  eventBaseCopy,
  type EventBaseFailure,
} from "@/lib/events/bases-kernel.server";
import {
  experienceLevelValues,
  isExperienceLevel,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  groupTypeValues,
  isGroupType,
  type GroupType,
} from "@/lib/events/group-types";
import { uniqueValues } from "@/lib/events/bases-repository/shared.server";
import { toTitleCase } from "@/lib/shared/text-normalization";

/**
 * What a category submission must satisfy before it is written: its own
 * fields, modalities of the same event, and an identity (age range, group
 * types, modalities) no other category of the event already holds.
 */

export type CategoryInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevels: string[];
};

export type ValidCategoryInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: GroupType[];
  modalityIds: string[];
  experienceLevels: ExperienceLevel[];
  groupTypeKey: string;
  experienceLevelKey: string;
};

export async function validateCategoryInput(
  eventId: string,
  input: CategoryInput,
  exceptId?: string,
): Promise<{ ok: true; input: ValidCategoryInput } | EventBaseFailure> {
  const fields = readCategoryFields(input);

  if (!fields.ok) {
    return fields;
  }

  const { name: normalizedName, groupTypes, modalityIds } = fields;

  const validModalities = await db
    .select({ id: modalities.id })
    .from(modalities)
    .where(
      and(eq(modalities.eventId, eventId), inArray(modalities.id, modalityIds)),
    );

  if (validModalities.length !== modalityIds.length) {
    return {
      ok: false,
      code: "invalid-modality",
      error: "Elegí modalidades del evento activo.",
      fieldErrors: {
        modalityIds: "Elegí modalidades del evento activo.",
      },
    };
  }

  const experienceLevels = readExperienceLevels(input.experienceLevels);

  if (!experienceLevels.ok) {
    return experienceLevels;
  }

  const validInput = {
    name: normalizedName,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes,
    modalityIds: modalityIds.sort(),
    experienceLevels: experienceLevels.values,
    groupTypeKey: groupTypes.join("|"),
    experienceLevelKey: experienceLevels.values.join("|"),
  };

  if (await findDuplicateCategory(eventId, validInput, exceptId)) {
    return eventBaseCollision(
      "duplicate-category-identity",
      "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
    );
  }

  if (await findOverlappingCategory(eventId, validInput, exceptId)) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error:
        "La categoría se solapa con otra categoría para la misma modalidad y tipo de grupo.",
      fieldErrors: {},
    };
  }

  return { ok: true, input: validInput };
}

/**
 * The checks that need nothing but the submission, in the order the
 * administrator meets them: name, ages, group types, then whether any modality
 * was chosen at all.
 */
function readCategoryFields(
  input: CategoryInput,
):
  | { ok: true; name: string; groupTypes: GroupType[]; modalityIds: string[] }
  | EventBaseFailure {
  const normalizedName = toTitleCase(input.name);

  if (normalizedName.length === 0) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: eventBaseCopy.category.invalidError,
      fieldErrors: { name: eventBaseCopy.category.requiredNameError },
    };
  }

  if (!Number.isInteger(input.minAge) || !Number.isInteger(input.maxAge)) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "Revisá las edades de la categoría.",
      fieldErrors: { ageRange: "Ingresá edades válidas." },
    };
  }

  if (input.minAge < 0 || input.maxAge < input.minAge) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "Revisá las edades de la categoría.",
      fieldErrors: {
        ageRange: "La edad máxima debe ser mayor o igual a la mínima.",
      },
    };
  }

  const groupTypes = uniqueValues(input.groupTypes)
    .filter(isGroupType)
    .sort((a, b) => groupTypeValues.indexOf(a) - groupTypeValues.indexOf(b));

  if (groupTypes.length === 0) {
    return {
      ok: false,
      code: "invalid-group-type",
      error: "Elegí al menos un tipo de grupo.",
      fieldErrors: { groupTypes: "Elegí al menos un tipo de grupo." },
    };
  }

  const modalityIds = uniqueValues(input.modalityIds);

  if (modalityIds.length === 0) {
    return {
      ok: false,
      code: "invalid-modality",
      error: "Elegí al menos una modalidad.",
      fieldErrors: { modalityIds: "Elegí al menos una modalidad." },
    };
  }

  return { ok: true, name: normalizedName, groupTypes, modalityIds };
}

function readExperienceLevels(
  submitted: string[],
): { ok: true; values: ExperienceLevel[] } | EventBaseFailure {
  // Stored in the enum's declaration order, not the presentation order of
  // `experienceLevelOrder`: the stored sets already follow it, and
  // `describeAgeOrLevelEdit` compares them in order.
  const experienceLevels = uniqueValues(submitted)
    .filter(isExperienceLevel)
    .sort(
      (a, b) =>
        experienceLevelValues.indexOf(a) - experienceLevelValues.indexOf(b),
    );

  if (experienceLevels.length !== uniqueValues(submitted).length) {
    return {
      ok: false,
      code: "invalid-experience-level",
      error: "Elegí niveles de experiencia válidos.",
      fieldErrors: {
        experienceLevels: "Elegí niveles de experiencia válidos.",
      },
    };
  }

  return { ok: true, values: experienceLevels };
}

async function findDuplicateCategory(
  eventId: string,
  input: ValidCategoryInput,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(categories.id, exceptId) : undefined;
  const candidates = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.eventId, eventId),
        eq(categories.minAge, input.minAge),
        eq(categories.maxAge, input.maxAge),
        eq(categories.groupTypeKey, input.groupTypeKey),
        idFilter,
      ),
    );

  if (candidates.length === 0) {
    return false;
  }

  const relationRows = await db
    .select({
      categoryId: categoryModalities.categoryId,
      modalityId: categoryModalities.modalityId,
    })
    .from(categoryModalities)
    .where(
      inArray(
        categoryModalities.categoryId,
        candidates.map((category) => category.id),
      ),
    );

  return candidates.some((category) => {
    const modalityIds = relationRows
      .filter((relation) => relation.categoryId === category.id)
      .map((relation) => relation.modalityId)
      .sort();

    return haveSameValues(modalityIds, input.modalityIds);
  });
}

async function findOverlappingCategory(
  eventId: string,
  input: ValidCategoryInput,
  exceptId?: string,
) {
  const idFilter = exceptId ? ne(categories.id, exceptId) : undefined;
  const possibleOverlaps = await db
    .select({
      id: categories.id,
      groupTypes: categories.groupTypes,
    })
    .from(categories)
    .where(
      and(
        eq(categories.eventId, eventId),
        sql`${categories.minAge} <= ${input.maxAge}`,
        sql`${categories.maxAge} >= ${input.minAge}`,
        idFilter,
      ),
    );

  if (possibleOverlaps.length === 0) {
    return false;
  }

  const relationRows = await db
    .select({
      categoryId: categoryModalities.categoryId,
      modalityId: categoryModalities.modalityId,
    })
    .from(categoryModalities)
    .where(
      inArray(
        categoryModalities.categoryId,
        possibleOverlaps.map((category) => category.id),
      ),
    );

  return possibleOverlaps.some((category) => {
    const hasSharedGroupType = category.groupTypes.some((groupType) =>
      input.groupTypes.some((inputGroupType) => inputGroupType === groupType),
    );
    const hasSharedModality = relationRows.some(
      (relation) =>
        relation.categoryId === category.id &&
        input.modalityIds.includes(relation.modalityId),
    );

    return hasSharedGroupType && hasSharedModality;
  });
}

export function categoryValues(input: ValidCategoryInput) {
  return {
    name: input.name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes: input.groupTypes,
    groupTypeKey: input.groupTypeKey,
    experienceLevels: input.experienceLevels,
    experienceLevelKey: input.experienceLevelKey,
  };
}

export function haveSameValues(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((value, index) => value === second[index]);
}

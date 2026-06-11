import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { professors } from "@/db/schema";

export type ProfessorFormField = "firstName" | "lastName";

export type CreateProfessorInput = Record<ProfessorFormField, string>;

export type ProfessorListItem = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "documentType" | "documentNumber"
> & {
  isIncomplete: boolean;
};

export type CreateProfessorResult =
  | { ok: true; professor: typeof professors.$inferSelect }
  | {
      ok: false;
      message: string;
      fieldErrors: Partial<Record<ProfessorFormField, string>>;
      values: CreateProfessorInput;
    };

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);

export async function listAcademyProfessors(
  academyId: string,
): Promise<ProfessorListItem[]> {
  const rows = await db.query.professors.findMany({
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
    },
    where: eq(professors.academyId, academyId),
    orderBy: [
      asc(sql`lower(${professors.lastName})`),
      asc(sql`lower(${professors.firstName})`),
    ],
  });

  return rows.map((professor) => ({
    ...professor,
    isIncomplete:
      professor.documentType === null || professor.documentNumber === null,
  }));
}

export async function createAcademyProfessor(
  academyId: string,
  input: CreateProfessorInput,
): Promise<CreateProfessorResult> {
  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
  };
  const firstName = normalizeSpanishTitleCase(input.firstName);
  const lastName = normalizeSpanishTitleCase(input.lastName, {
    lowercaseLeadingParticle: true,
  });
  const fieldErrors: Partial<Record<ProfessorFormField, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = "Ingresá el nombre del Profesor.";
  }

  if (!lastName) {
    fieldErrors.lastName = "Ingresá el apellido del Profesor.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors,
      values,
    };
  }

  const [professor] = await db
    .insert(professors)
    .values({
      academyId,
      firstName,
      lastName,
    })
    .returning();

  return { ok: true, professor };
}

export function normalizeSpanishTitleCase(
  value: string,
  options: { lowercaseLeadingParticle?: boolean } = {},
) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => normalizeSpanishTitleCaseWord(word, index, options))
    .join(" ");
}

function normalizeSpanishTitleCaseWord(
  word: string,
  index: number,
  options: { lowercaseLeadingParticle?: boolean },
) {
  const lowerWord = word.toLocaleLowerCase("es-AR");

  if (
    spanishParticles.has(lowerWord) &&
    (index > 0 || options.lowercaseLeadingParticle)
  ) {
    return lowerWord;
  }

  return lowerWord
    .split("-")
    .map((part) => capitalizeFirstCharacter(part))
    .join("-");
}

function capitalizeFirstCharacter(value: string) {
  const [firstCharacter, ...rest] = Array.from(value);

  if (!firstCharacter) {
    return value;
  }

  return `${firstCharacter.toLocaleUpperCase("es-AR")}${rest.join("")}`;
}

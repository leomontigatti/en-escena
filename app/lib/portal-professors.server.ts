import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { professors } from "@/db/schema";

export type ProfessorFormField = "firstName" | "lastName";

export type CreateProfessorInput = Record<ProfessorFormField, string>;

export type UpdateProfessorInput = CreateProfessorInput & {
  documentType: string;
  documentNumber: string;
};

export type ProfessorListItem = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "active" | "documentType" | "documentNumber"
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

export type UpdateProfessorField = keyof UpdateProfessorInput;

export type UpdateProfessorResult =
  | { ok: true; professor: typeof professors.$inferSelect }
  | {
      ok: false;
      message: string;
      fieldErrors: Partial<Record<UpdateProfessorField, string>>;
      values: UpdateProfessorInput;
    };

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);
const reviewProfessorFieldsMessage = "Revisá los campos marcados.";

type ProfessorIdentityRow = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "active" | "documentType" | "documentNumber"
>;

export async function listAcademyProfessors(
  academyId: string,
  options: {
    status?: "active" | "archived";
  } = {},
): Promise<ProfessorListItem[]> {
  const status = options.status ?? "active";
  const rows = await db.query.professors.findMany({
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      active: true,
      documentType: true,
      documentNumber: true,
    },
    where: and(
      eq(professors.academyId, academyId),
      eq(professors.active, status === "active"),
    ),
    orderBy: [
      asc(sql`lower(${professors.lastName})`),
      asc(sql`lower(${professors.firstName})`),
    ],
  });

  return rows.map(toProfessorListItem);
}

export async function createAcademyProfessor(
  academyId: string,
  input: CreateProfessorInput,
): Promise<CreateProfessorResult> {
  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
  };
  const { firstName, lastName, fieldErrors } = normalizeProfessorNames(input);

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
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
      active: true,
    })
    .returning();

  return { ok: true, professor };
}

export async function findAcademyProfessor(
  academyId: string,
  professorId: string,
): Promise<ProfessorListItem | null> {
  const professor = await db.query.professors.findFirst({
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      active: true,
      documentType: true,
      documentNumber: true,
    },
    where: and(
      eq(professors.id, professorId),
      eq(professors.academyId, academyId),
    ),
  });

  if (!professor) {
    return null;
  }

  return toProfessorListItem(professor);
}

export async function updateAcademyProfessor(
  academyId: string,
  professorId: string,
  input: UpdateProfessorInput,
): Promise<UpdateProfessorResult> {
  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
    documentType: input.documentType,
    documentNumber: input.documentNumber,
  };
  const {
    firstName,
    lastName,
    fieldErrors: normalizedNameFieldErrors,
  } = normalizeProfessorNames(input);
  const fieldErrors: Partial<Record<UpdateProfessorField, string>> = {
    ...normalizedNameFieldErrors,
  };

  const normalizedDocument = normalizeProfessorDocumentPair(
    input.documentType,
    input.documentNumber,
  );

  if (!normalizedDocument.ok) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors: {
        ...fieldErrors,
        ...normalizedDocument.fieldErrors,
      },
      values,
    };
  }

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors,
      values,
    };
  }

  if (
    normalizedDocument.documentType !== null &&
    normalizedDocument.documentNumber !== null
  ) {
    const duplicateProfessor = await db.query.professors.findFirst({
      columns: { id: true },
      where: and(
        eq(professors.academyId, academyId),
        ne(professors.id, professorId),
        eq(professors.documentType, normalizedDocument.documentType),
        eq(professors.documentNumber, normalizedDocument.documentNumber),
      ),
    });

    if (duplicateProfessor) {
      return {
        ok: false,
        message: reviewProfessorFieldsMessage,
        fieldErrors: {
          documentNumber:
            "Ya existe un Profesor con ese documento en tu academia.",
        },
        values,
      };
    }
  }

  const [professor] = await db
    .update(professors)
    .set({
      firstName,
      lastName,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
      updatedAt: new Date(),
    })
    .where(
      and(eq(professors.id, professorId), eq(professors.academyId, academyId)),
    )
    .returning();

  return { ok: true, professor };
}

export async function archiveAcademyProfessor(
  academyId: string,
  professorId: string,
) {
  return await setProfessorActiveState(academyId, professorId, false);
}

export async function reactivateAcademyProfessor(
  academyId: string,
  professorId: string,
) {
  return await setProfessorActiveState(academyId, professorId, true);
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

function toProfessorListItem(
  professor: ProfessorIdentityRow,
): ProfessorListItem {
  return {
    ...professor,
    isIncomplete:
      professor.documentType === null || professor.documentNumber === null,
  };
}

function normalizeProfessorNames(input: CreateProfessorInput) {
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

  return { firstName, lastName, fieldErrors };
}

function hasFieldErrors(fieldErrors: Record<string, string | undefined>) {
  return Object.keys(fieldErrors).length > 0;
}

function normalizeProfessorDocumentPair(
  documentTypeInput: string,
  documentNumberInput: string,
):
  | {
      ok: true;
      documentType: (typeof professors.$inferSelect)["documentType"];
      documentNumber: string | null;
    }
  | {
      ok: false;
      fieldErrors: Partial<Record<UpdateProfessorField, string>>;
    } {
  const documentType = documentTypeInput.trim();
  const documentNumber = documentNumberInput.trim();
  const fieldErrors: Partial<Record<UpdateProfessorField, string>> = {};

  if (!documentType && !documentNumber) {
    return {
      ok: true,
      documentType: null,
      documentNumber: null,
    };
  }

  if (!documentType) {
    fieldErrors.documentType = "Seleccioná el tipo de documento.";
  }

  if (!documentNumber) {
    fieldErrors.documentNumber = "Ingresá el número de documento.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  if (!isDocumentType(documentType)) {
    return {
      ok: false,
      fieldErrors: {
        documentType: "Seleccioná un tipo de documento válido.",
      },
    };
  }

  if (documentType === "dni") {
    const normalizedDni = documentNumber.replace(/[.\s-]+/g, "");

    if (!/^\d+$/.test(normalizedDni)) {
      return {
        ok: false,
        fieldErrors: {
          documentNumber: "Ingresá un DNI válido.",
        },
      };
    }

    return {
      ok: true,
      documentType,
      documentNumber: normalizedDni,
    };
  }

  return {
    ok: true,
    documentType,
    documentNumber: documentNumber.replace(/\s+/g, " "),
  };
}

function isDocumentType(
  value: string,
): value is NonNullable<(typeof professors.$inferSelect)["documentType"]> {
  return value === "dni" || value === "passport" || value === "other";
}

async function setProfessorActiveState(
  academyId: string,
  professorId: string,
  active: boolean,
) {
  const professor = await findAcademyProfessor(academyId, professorId);

  if (!professor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const [updatedProfessor] = await db
    .update(professors)
    .set({
      active,
      updatedAt: new Date(),
    })
    .where(
      and(eq(professors.id, professorId), eq(professors.academyId, academyId)),
    )
    .returning();

  return updatedProfessor;
}

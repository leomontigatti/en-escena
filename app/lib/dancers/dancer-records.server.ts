import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";
import { isUniqueViolation } from "@/lib/shared/error-properties.server";
import type { RosterScope } from "@/lib/roster/roster-scope";

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);

export type DancerNameInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export type DancerDocumentInput = {
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
};

export type DancerDocumentType = NonNullable<
  (typeof dancers.$inferSelect)["documentType"]
>;

export type DancerEditableSnapshot = {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: string | null;
  active: boolean;
};

export function normalizeDancerValues(
  input: DancerNameInput,
  options: {
    fieldErrors?: Partial<Record<keyof DancerNameInput, string>>;
    lowercaseLeadingLastNameParticle?: boolean;
  } = {},
) {
  const firstName = normalizeSpanishTitleCase(input.firstName);
  const lastName = normalizeSpanishTitleCase(input.lastName, {
    lowercaseLeadingParticle: options.lowercaseLeadingLastNameParticle ?? true,
  });
  const birthDate = input.birthDate.trim();
  const fieldErrors: Partial<Record<keyof DancerNameInput, string>> = {};

  if (!firstName) {
    fieldErrors.firstName =
      options.fieldErrors?.firstName ?? "Ingresá el nombre del Bailarín.";
  }

  if (!lastName) {
    fieldErrors.lastName =
      options.fieldErrors?.lastName ?? "Ingresá el apellido del Bailarín.";
  }

  if (!birthDate) {
    fieldErrors.birthDate =
      options.fieldErrors?.birthDate ?? "Ingresá la fecha de nacimiento.";
  } else if (!isDateOnly(birthDate)) {
    fieldErrors.birthDate = "Usá una fecha válida.";
  } else if (isFutureDateOnly(birthDate)) {
    fieldErrors.birthDate = "La fecha de nacimiento no puede ser futura.";
  }

  return { firstName, lastName, birthDate, fieldErrors };
}

export function normalizeDancerDocumentPair(
  documentTypeInput: string,
  documentNumberInput: string,
):
  | {
      ok: true;
      documentType: DancerDocumentType | null;
      documentNumber: string | null;
    }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof DancerDocumentInput, string>>;
    } {
  const documentType = documentTypeInput.trim();
  const documentNumber = documentNumberInput.trim();
  const fieldErrors: Partial<Record<keyof DancerDocumentInput, string>> = {};

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
          documentNumber: "Ingresá un DNI válido usando solo números.",
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

const dancerDocumentNumberUniqueIndex = "dancer_academy_document_number_unique";

/** Whose academy the reader is looking at: their own, or any, from the panel. */

export type DancerDocumentConflict = {
  /**
   * The dancer already holding the number, so the form can link to them.
   * Absent only when the index refused a write whose holder the follow-up
   * read could not name.
   */
  dancerId?: string;
  message: string;
};

/**
 * The number alone is the key within an academy, whatever type it was loaded
 * under, and an archived dancer still holds theirs (PRD #1090).
 */
async function findDuplicateDancerDocument(input: {
  academyId: string;
  /** Absent while creating: there is no row to exclude yet. */
  dancerId?: string;
  documentNumber: string;
}) {
  return await db.query.dancers.findFirst({
    columns: { id: true, active: true },
    where: and(
      eq(dancers.academyId, input.academyId),
      input.dancerId ? ne(dancers.id, input.dancerId) : undefined,
      eq(dancers.documentNumber, input.documentNumber),
    ),
  });
}

export async function findDancerDocumentConflict(input: {
  academyId: string;
  dancerId?: string;
  documentNumber: string;
  scope: RosterScope;
}): Promise<DancerDocumentConflict | null> {
  const duplicate = await findDuplicateDancerDocument(input);

  if (!duplicate) {
    return null;
  }

  return {
    dancerId: duplicate.id,
    message: dancerDocumentConflictMessage({
      archived: !duplicate.active,
      scope: input.scope,
    }),
  };
}

/**
 * Runs a write that the unique index can refuse and maps that refusal to the
 * same field error the pre-check produces, so two saves landing at the same
 * instant never end in a server error.
 */
export async function writeDancerGuardingDocument<T>(input: {
  academyId: string;
  dancerId?: string;
  documentNumber: string | null;
  scope: RosterScope;
  write: () => Promise<T>;
}): Promise<
  { ok: true; result: T } | { ok: false; conflict: DancerDocumentConflict }
> {
  try {
    return { ok: true, result: await input.write() };
  } catch (error) {
    if (
      input.documentNumber === null ||
      !isUniqueViolation(error, dancerDocumentNumberUniqueIndex)
    ) {
      throw error;
    }

    const conflict = await findDancerDocumentConflict({
      academyId: input.academyId,
      dancerId: input.dancerId,
      documentNumber: input.documentNumber,
      scope: input.scope,
    });

    return {
      ok: false,
      conflict: conflict ?? {
        dancerId: input.dancerId,
        message: dancerDocumentConflictMessage({
          archived: false,
          scope: input.scope,
        }),
      },
    };
  }
}

function dancerDocumentConflictMessage(options: {
  archived: boolean;
  scope: RosterScope;
}) {
  const person = options.archived ? "un Bailarín archivado" : "un Bailarín";
  const academy = options.scope === "portal" ? "tu academia" : "la academia";

  return `Ya existe ${person} con ese documento en ${academy}.`;
}

function normalizeSpanishTitleCase(
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

function isDocumentType(value: string): value is DancerDocumentType {
  return value === "dni" || value === "passport" || value === "other";
}

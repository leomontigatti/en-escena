import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";

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

export function normalizeDancerValues(input: DancerNameInput) {
  const firstName = normalizeSpanishTitleCase(input.firstName);
  const lastName = normalizeSpanishTitleCase(input.lastName, {
    lowercaseLeadingParticle: true,
  });
  const birthDate = input.birthDate.trim();
  const fieldErrors: Partial<Record<keyof DancerNameInput, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = "Ingresá el nombre del Bailarín.";
  }

  if (!lastName) {
    fieldErrors.lastName = "Ingresá el apellido del Bailarín.";
  }

  if (!birthDate) {
    fieldErrors.birthDate = "Ingresá la fecha de nacimiento.";
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
      documentType: (typeof dancers.$inferSelect)["documentType"];
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

export async function findDuplicateDancerDocument(input: {
  academyId: string;
  dancerId: string;
  documentType: NonNullable<(typeof dancers.$inferSelect)["documentType"]>;
  documentNumber: string;
}) {
  return await db.query.dancers.findFirst({
    columns: { id: true },
    where: and(
      eq(dancers.academyId, input.academyId),
      ne(dancers.id, input.dancerId),
      eq(dancers.documentType, input.documentType),
      eq(dancers.documentNumber, input.documentNumber),
    ),
  });
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

function isDocumentType(
  value: string,
): value is NonNullable<(typeof dancers.$inferSelect)["documentType"]> {
  return value === "dni" || value === "passport" || value === "other";
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

function isFutureDateOnly(value: string) {
  const today = new Date().toISOString().slice(0, 10);

  return value > today;
}

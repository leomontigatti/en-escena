import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { professors } from "@/db/schema";
import { requiredFieldMessage } from "@/lib/shared/forms";

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);

export type ProfessorNameInput = {
  firstName: string;
  lastName: string;
};

export type ProfessorDocumentInput = {
  documentType: string;
  documentNumber: string;
};

export type ProfessorEditableSnapshot = {
  firstName: string;
  lastName: string;
  documentType: (typeof professors.$inferSelect)["documentType"];
  documentNumber: string | null;
  active: boolean;
};

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

export function normalizeProfessorNames(input: ProfessorNameInput) {
  const firstName = normalizeSpanishTitleCase(input.firstName);
  const lastName = normalizeSpanishTitleCase(input.lastName, {
    lowercaseLeadingParticle: true,
  });
  const fieldErrors: Partial<Record<keyof ProfessorNameInput, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = requiredFieldMessage;
  }

  if (!lastName) {
    fieldErrors.lastName = requiredFieldMessage;
  }

  return { firstName, lastName, fieldErrors };
}

export function normalizeProfessorDocumentPair(
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
      fieldErrors: Partial<Record<keyof ProfessorDocumentInput, string>>;
    } {
  const documentType = documentTypeInput.trim();
  const documentNumber = documentNumberInput.trim();
  const fieldErrors: Partial<Record<keyof ProfessorDocumentInput, string>> = {};

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

export async function findDuplicateProfessorDocument(input: {
  academyId: string;
  professorId: string;
  documentType: NonNullable<(typeof professors.$inferSelect)["documentType"]>;
  documentNumber: string;
}) {
  return await db.query.professors.findFirst({
    columns: { id: true },
    where: and(
      eq(professors.academyId, input.academyId),
      ne(professors.id, input.professorId),
      eq(professors.documentType, input.documentType),
      eq(professors.documentNumber, input.documentNumber),
    ),
  });
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
): value is NonNullable<(typeof professors.$inferSelect)["documentType"]> {
  return value === "dni" || value === "passport" || value === "other";
}

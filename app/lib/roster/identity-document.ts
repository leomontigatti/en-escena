import type { z } from "zod";

/**
 * The owner of a roster person's `Documento de identidad`: the type and number
 * pair a dancer and a professor carry, loaded whole or not at all. Client-safe
 * and surface-neutral, so the forms, the write paths and anything matching
 * people by document read the one rule.
 */

export const documentTypeOptions = [
  { value: "dni", label: "DNI" },
  { value: "passport", label: "Pasaporte" },
  { value: "other", label: "Otro" },
] as const;

export const documentTypeEmptyLabel = "Sin documento";

export type IdentityDocumentType =
  (typeof documentTypeOptions)[number]["value"];

export type IdentityDocumentFieldErrors = Partial<
  Record<"documentType" | "documentNumber", string>
>;

export type NormalizedIdentityDocument =
  | { ok: true; documentType: IdentityDocumentType; documentNumber: string }
  | { ok: true; documentType: null; documentNumber: null }
  | { ok: false; fieldErrors: IdentityDocumentFieldErrors };

type StoredIdentityDocument = {
  documentType: string | null;
  documentNumber: string | null;
};

const dniSeparators = /[.\s-]+/g;

/**
 * The form inputs read as a stored document: both empty clears it, half of one
 * is refused, a DNI loses its dots, spaces and hyphens and must then be digits,
 * and any other number keeps single spaces. The stored DNI is the key that
 * matches one person across rosters.
 */
export function normalizeIdentityDocument(
  documentTypeInput: string,
  documentNumberInput: string,
): NormalizedIdentityDocument {
  const documentType = documentTypeInput.trim();
  const documentNumber = documentNumberInput.trim();
  const fieldErrors: IdentityDocumentFieldErrors = {};

  if (!documentType && !documentNumber) {
    return { ok: true, documentType: null, documentNumber: null };
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

  if (!isIdentityDocumentType(documentType)) {
    return {
      ok: false,
      fieldErrors: {
        documentType: "Seleccioná un tipo de documento válido.",
      },
    };
  }

  if (documentType === "dni") {
    const normalizedDni = documentNumber.replace(dniSeparators, "");

    if (!/^\d+$/.test(normalizedDni)) {
      return {
        ok: false,
        fieldErrors: {
          documentNumber: "Ingresá un DNI válido usando solo números.",
        },
      };
    }

    return { ok: true, documentType, documentNumber: normalizedDni };
  }

  return {
    ok: true,
    documentType,
    documentNumber: documentNumber.replace(/\s+/g, " "),
  };
}

/**
 * `normalizeIdentityDocument` as a zod refinement, so every roster person form
 * reports on the field exactly what the server refuses, with the same message.
 */
export function refineIdentityDocument(
  values: { documentType: string; documentNumber: string },
  context: z.RefinementCtx,
) {
  const document = normalizeIdentityDocument(
    values.documentType,
    values.documentNumber,
  );

  if (document.ok) {
    return;
  }

  for (const field of ["documentType", "documentNumber"] as const) {
    const message = document.fieldErrors[field];

    if (message) {
      context.addIssue({ code: "custom", message, path: [field] });
    }
  }
}

/** Whether a stored person has a whole document loaded. */
export function hasIdentityDocument(document: StoredIdentityDocument) {
  return Boolean(document.documentType && document.documentNumber);
}

/**
 * The document as every list prints it, `DNI 12345678`; null when none is
 * loaded, so the caller shows `documentTypeEmptyLabel` in its own style.
 */
export function formatIdentityDocument(document: StoredIdentityDocument) {
  if (!hasIdentityDocument(document)) {
    return null;
  }

  const label =
    documentTypeOptions.find((option) => option.value === document.documentType)
      ?.label ?? document.documentType;

  return `${label} ${document.documentNumber}`;
}

/**
 * The stored form of a search that reads as a formatted DNI (`12.345.678`), so
 * a list finds the person whatever way the number was typed. Null when the
 * search is not one, or is already stored-shaped and the plain search finds it.
 */
export function toDocumentNumberSearchTerm(search: string) {
  const trimmed = search.trim();
  const stripped = trimmed.replace(dniSeparators, "");

  return stripped !== trimmed && /^\d+$/.test(stripped) ? stripped : null;
}

function isIdentityDocumentType(value: string): value is IdentityDocumentType {
  return documentTypeOptions.some((option) => option.value === value);
}

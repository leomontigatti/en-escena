import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  getDancerVerificationStatus,
  type DancerVerificationStatus,
} from "@/lib/dancers/verification";

export type DancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  birthDate: string;
  documentType: string | null;
  documentNumber: string | null;
  verificationStatus: DancerVerificationStatus;
};

export type CreateDancerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export type DancerDocumentType = "dni" | "passport" | "other";

export type UpdateDancerInput = CreateDancerInput & {
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
};

type DancerNameAndBirthDateValues = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

type NormalizedDancerDocument =
  | {
      ok: true;
      documentType: DancerDocumentType | null;
      documentNumber: string | null;
    }
  | {
      ok: false;
      fieldErrors: Partial<Record<"documentNumber" | "documentType", string>>;
    };

type NormalizedUpdateDancerInput = DancerNameAndBirthDateValues & {
  documentType: DancerDocumentType | null;
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
};

type DancerImageField =
  | "documentFrontImageStorageKey"
  | "documentBackImageStorageKey";

export type CreateDancerResult =
  | { ok: true; dancer: typeof dancers.$inferSelect }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<keyof CreateDancerInput, string>>;
      values: CreateDancerInput;
    };

export type UpdateDancerField = keyof UpdateDancerInput;
type DancerStatusFilter = "active" | "archived" | "all";

export type UpdateDancerResult =
  | { ok: true; dancer: typeof dancers.$inferSelect }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<UpdateDancerField, string>>;
      values: UpdateDancerInput;
    };

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);

export async function listDancersForAcademy(
  academyId: string,
  options: {
    status?: DancerStatusFilter;
  } = {},
): Promise<DancerListItem[]> {
  const status = options.status ?? "active";
  const rows = await db.query.dancers.findMany({
    where: getDancerListWhere(academyId, status),
    orderBy: [asc(dancers.lastName), asc(dancers.firstName)],
  });

  return rows.map((dancer) => ({
    id: dancer.id,
    firstName: dancer.firstName,
    lastName: dancer.lastName,
    active: dancer.active,
    birthDate: dancer.birthDate,
    documentType: dancer.documentType,
    documentNumber: dancer.documentNumber,
    verificationStatus: getDancerVerificationStatus(dancer),
  }));
}

function getDancerListWhere(academyId: string, status: DancerStatusFilter) {
  if (status === "all") {
    return eq(dancers.academyId, academyId);
  }

  return and(
    eq(dancers.academyId, academyId),
    eq(dancers.active, status === "active"),
  );
}

export async function createDancerForAcademy(
  academyId: string,
  input: CreateDancerInput,
): Promise<CreateDancerResult> {
  const validation = validateCreateDancerInput(input);

  if (!validation.ok) {
    return validation;
  }

  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: validation.input.firstName,
      lastName: validation.input.lastName,
      birthDate: validation.input.birthDate,
      active: true,
    })
    .returning();

  return { ok: true, dancer };
}

export async function findDancerForAcademy(
  academyId: string,
  dancerId: string,
) {
  return await db.query.dancers.findFirst({
    where: and(eq(dancers.id, dancerId), eq(dancers.academyId, academyId)),
  });
}

export async function updateDancerForAcademy(
  academyId: string,
  dancerId: string,
  input: UpdateDancerInput,
): Promise<UpdateDancerResult> {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const validation = await validateUpdateDancerInput(dancer, input);

  if (!validation.ok) {
    return validation;
  }

  const [updatedDancer] = await db
    .update(dancers)
    .set({
      firstName: validation.input.firstName,
      lastName: validation.input.lastName,
      birthDate: validation.input.birthDate,
      documentType: validation.input.documentType,
      documentNumber: validation.input.documentNumber,
      documentFrontImageStorageKey:
        validation.input.documentFrontImageStorageKey,
      documentBackImageStorageKey: validation.input.documentBackImageStorageKey,
      identityVerifiedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(dancers.id, dancerId), eq(dancers.academyId, academyId)))
    .returning();

  return { ok: true, dancer: updatedDancer };
}

export async function archiveDancerForAcademy(
  academyId: string,
  dancerId: string,
) {
  return setDancerActiveState(academyId, dancerId, false);
}

export async function reactivateDancerForAcademy(
  academyId: string,
  dancerId: string,
) {
  return setDancerActiveState(academyId, dancerId, true);
}

function validateCreateDancerInput(
  input: CreateDancerInput,
):
  | { ok: true; input: CreateDancerInput }
  | Extract<CreateDancerResult, { ok: false }> {
  const values = normalizeDancerNameAndBirthDateValues(input);
  const fieldErrors = validateDancerNameAndBirthDateValues(values);

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors,
      values,
    };
  }

  return {
    ok: true,
    input: {
      firstName: toSpanishTitleCase(values.firstName),
      lastName: toSpanishTitleCase(values.lastName),
      birthDate: values.birthDate,
    },
  };
}

async function validateUpdateDancerInput(
  dancer: typeof dancers.$inferSelect,
  input: UpdateDancerInput,
): Promise<
  | {
      ok: true;
      input: NormalizedUpdateDancerInput;
    }
  | Extract<UpdateDancerResult, { ok: false }>
> {
  const values = {
    ...normalizeDancerNameAndBirthDateValues(input),
    documentType: input.documentType.trim(),
    documentNumber: input.documentNumber,
    documentFrontImageStorageKey: input.documentFrontImageStorageKey.trim(),
    documentBackImageStorageKey: input.documentBackImageStorageKey.trim(),
  } satisfies UpdateDancerInput;
  const fieldErrors: Partial<Record<UpdateDancerField, string>> =
    validateDancerNameAndBirthDateValues(values);

  if (getDancerVerificationStatus(dancer) === "verified") {
    return {
      ok: false,
      error:
        "La identidad verificada solo puede corregirse desde administración.",
      fieldErrors,
      values,
    };
  }

  const document = normalizeDancerDocumentPair({
    documentType: values.documentType,
    documentNumber: values.documentNumber,
  });
  let normalizedDocument: NormalizedUpdateDancerInput | null = null;

  if (!document.ok) {
    Object.assign(fieldErrors, document.fieldErrors);
  } else {
    normalizedDocument = {
      firstName: toSpanishTitleCase(values.firstName),
      lastName: toSpanishTitleCase(values.lastName),
      birthDate: values.birthDate,
      documentType: document.documentType,
      documentNumber: document.documentNumber,
      ...normalizeDancerDocumentImages(
        {
          documentFrontImageStorageKey: values.documentFrontImageStorageKey,
          documentBackImageStorageKey: values.documentBackImageStorageKey,
        },
        document.documentType !== null && document.documentNumber !== null,
      ),
    };

    if (
      normalizedDocument.documentType !== null &&
      normalizedDocument.documentNumber !== null &&
      (await hasDuplicateDancerDocument({
        academyId: dancer.academyId,
        dancerId: dancer.id,
        documentType: normalizedDocument.documentType,
        documentNumber: normalizedDocument.documentNumber,
      }))
    ) {
      fieldErrors.documentNumber =
        "Ya existe un Bailarín con ese documento en tu academia.";
    }
  }

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors,
      values,
    };
  }

  return {
    ok: true,
    input: normalizedDocument!,
  };
}

export function toSpanishTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es-AR");

      if (index > 0 && spanishParticles.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toLocaleUpperCase("es-AR") + lower.slice(1);
    })
    .join(" ");
}

function normalizeDancerDocumentPair(input: {
  documentType: string;
  documentNumber: string;
}): NormalizedDancerDocument {
  const documentType = input.documentType.trim();
  const rawDocumentNumber = input.documentNumber;
  const hasDocumentType = documentType.length > 0;
  const hasDocumentNumber = rawDocumentNumber.trim().length > 0;

  if (!hasDocumentType && !hasDocumentNumber) {
    return {
      ok: true,
      documentType: null,
      documentNumber: null,
    };
  }

  if (hasDocumentType && !hasDocumentNumber) {
    return {
      ok: false,
      fieldErrors: {
        documentNumber: "Ingresá el número de documento.",
      },
    };
  }

  if (!hasDocumentType && hasDocumentNumber) {
    return {
      ok: false,
      fieldErrors: {
        documentType: "Seleccioná el tipo de documento.",
      },
    };
  }

  if (!isDancerDocumentType(documentType)) {
    return {
      ok: false,
      fieldErrors: {
        documentType: "Seleccioná un tipo de documento válido.",
      },
    };
  }

  if (documentType === "dni") {
    const normalizedDni = rawDocumentNumber.replace(/[.\s-]+/g, "");

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
    documentNumber: rawDocumentNumber.trim().replace(/\s+/g, " "),
  };
}

function normalizeDancerDocumentImages(
  input: Record<DancerImageField, string>,
  hasDocumentPair: boolean,
) {
  if (!hasDocumentPair) {
    return {
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
    };
  }

  return {
    documentFrontImageStorageKey: normalizeOptionalStorageKey(
      input.documentFrontImageStorageKey,
    ),
    documentBackImageStorageKey: normalizeOptionalStorageKey(
      input.documentBackImageStorageKey,
    ),
  };
}

function normalizeOptionalStorageKey(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}

async function hasDuplicateDancerDocument(input: {
  academyId: string;
  dancerId: string;
  documentType: DancerDocumentType;
  documentNumber: string;
}) {
  const duplicate = await db.query.dancers.findFirst({
    where: and(
      eq(dancers.academyId, input.academyId),
      ne(dancers.id, input.dancerId),
      eq(dancers.documentType, input.documentType),
      eq(dancers.documentNumber, input.documentNumber),
    ),
    columns: {
      id: true,
    },
  });

  return duplicate !== undefined;
}

async function setDancerActiveState(
  academyId: string,
  dancerId: string,
  active: boolean,
) {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const [updatedDancer] = await db
    .update(dancers)
    .set({
      active,
      updatedAt: new Date(),
    })
    .where(and(eq(dancers.id, dancerId), eq(dancers.academyId, academyId)))
    .returning();

  return updatedDancer;
}

function isDancerDocumentType(value: string): value is DancerDocumentType {
  return value === "dni" || value === "passport" || value === "other";
}

function normalizeDancerNameAndBirthDateValues(
  input: CreateDancerInput,
): DancerNameAndBirthDateValues {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: input.birthDate.trim(),
  };
}

function validateDancerNameAndBirthDateValues(
  values: DancerNameAndBirthDateValues,
) {
  const fieldErrors: Partial<Record<keyof CreateDancerInput, string>> = {};

  if (!values.firstName) {
    fieldErrors.firstName = "Ingresá el nombre.";
  }

  if (!values.lastName) {
    fieldErrors.lastName = "Ingresá el apellido.";
  }

  if (!values.birthDate) {
    fieldErrors.birthDate = "Ingresá la fecha de nacimiento.";
  } else if (!isDateOnly(values.birthDate)) {
    fieldErrors.birthDate = "Usá una fecha válida.";
  } else if (isFutureDateOnly(values.birthDate)) {
    fieldErrors.birthDate = "La fecha de nacimiento no puede ser futura.";
  }

  return fieldErrors;
}

function hasFieldErrors(fieldErrors: Record<string, string | undefined>) {
  return Object.keys(fieldErrors).length > 0;
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

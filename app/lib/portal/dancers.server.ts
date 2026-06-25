import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  getDancerVerificationStatus,
  type DancerVerificationStatus,
} from "@/lib/dancers/verification";
import {
  findDuplicateDancerDocument,
  normalizeDancerDocumentPair,
  normalizeDancerValues,
  type DancerDocumentType,
  type DancerNameInput,
} from "@/lib/dancers/dancer-records.server";
import { buildDancerEventParticipationSql } from "@/lib/people/participation.server";

export type DancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  birthDate: string;
  documentType: string | null;
  documentNumber: string | null;
  verificationStatus: DancerVerificationStatus;
  participationStatus: PortalParticipationStatus;
};

export type CreateDancerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export type UpdateDancerInput = CreateDancerInput & {
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
};

type NormalizedUpdateDancerInput = DancerNameInput & {
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
export type PortalParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";

export type UpdateDancerResult =
  | { ok: true; dancer: typeof dancers.$inferSelect }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<UpdateDancerField, string>>;
      values: UpdateDancerInput;
    };

export async function listDancersForAcademy(
  academyId: string,
  options: {
    selectedEventId?: string | null;
    status?: DancerStatusFilter;
  } = {},
): Promise<DancerListItem[]> {
  const status = options.status ?? "active";
  const selectedEventId = options.selectedEventId ?? null;
  const rows = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      active: dancers.active,
      birthDate: dancers.birthDate,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      isParticipating: buildDancerEventParticipationSql(selectedEventId),
    })
    .from(dancers)
    .where(getDancerListWhere(academyId, status))
    .orderBy(
      asc(sql`lower(${dancers.firstName})`),
      asc(sql`lower(${dancers.lastName})`),
    );

  return rows.map((dancer) => ({
    id: dancer.id,
    firstName: dancer.firstName,
    lastName: dancer.lastName,
    active: dancer.active,
    birthDate: dancer.birthDate,
    documentType: dancer.documentType,
    documentNumber: dancer.documentNumber,
    verificationStatus: getDancerVerificationStatus(dancer),
    participationStatus: toParticipationStatus(
      selectedEventId,
      dancer.isParticipating,
    ),
  }));
}

export async function countActiveDancersForAcademy(academyId: string) {
  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(dancers)
    .where(getDancerListWhere(academyId, "active"));

  return Number(count);
}

function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): PortalParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
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
  const normalizedValues = normalizePortalDancerValues(input);
  const values = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: input.birthDate.trim(),
  };

  if (hasFieldErrors(normalizedValues.fieldErrors)) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: normalizedValues.fieldErrors,
      values,
    };
  }

  return {
    ok: true,
    input: {
      firstName: normalizedValues.firstName,
      lastName: normalizedValues.lastName,
      birthDate: normalizedValues.birthDate,
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
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: input.birthDate.trim(),
    documentType: input.documentType.trim(),
    documentNumber: input.documentNumber,
    documentFrontImageStorageKey: input.documentFrontImageStorageKey.trim(),
    documentBackImageStorageKey: input.documentBackImageStorageKey.trim(),
  } satisfies UpdateDancerInput;
  const normalizedValues = normalizePortalDancerValues(values);
  const fieldErrors: Partial<Record<UpdateDancerField, string>> = {
    ...normalizedValues.fieldErrors,
  };

  if (getDancerVerificationStatus(dancer) === "verified") {
    return {
      ok: false,
      error:
        "La identidad verificada solo puede corregirse desde administración.",
      fieldErrors,
      values,
    };
  }

  const document = normalizeDancerDocumentPair(
    values.documentType,
    values.documentNumber,
  );

  if (!document.ok) {
    Object.assign(fieldErrors, document.fieldErrors);

    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors,
      values,
    };
  }

  const normalizedDocument: NormalizedUpdateDancerInput = {
    firstName: normalizedValues.firstName,
    lastName: normalizedValues.lastName,
    birthDate: normalizedValues.birthDate,
    documentType: document.documentType,
    documentNumber: document.documentNumber,
    ...normalizeDancerDocumentImages({
      documentFrontImageStorageKey: values.documentFrontImageStorageKey,
      documentBackImageStorageKey: values.documentBackImageStorageKey,
    }),
  };

  if (
    normalizedDocument.documentType !== null &&
    normalizedDocument.documentNumber !== null &&
    (await findDuplicateDancerDocument({
      academyId: dancer.academyId,
      dancerId: dancer.id,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
    }))
  ) {
    fieldErrors.documentNumber =
      "Ya existe un Bailarín con ese documento en tu academia.";
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
    input: normalizedDocument,
  };
}

function normalizeDancerDocumentImages(
  input: Record<DancerImageField, string>,
) {
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

function normalizePortalDancerValues(input: DancerNameInput) {
  return normalizeDancerValues(input, {
    fieldErrors: {
      firstName: "Ingresá el nombre.",
      lastName: "Ingresá el apellido.",
    },
    lowercaseLeadingLastNameParticle: false,
  });
}

function hasFieldErrors(fieldErrors: Record<string, string | undefined>) {
  return Object.keys(fieldErrors).length > 0;
}

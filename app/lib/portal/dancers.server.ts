import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  getDancerVerificationStatus,
  type DancerVerificationStatus,
} from "@/lib/dancers/verification";
import {
  findDancerDocumentConflict,
  normalizeDancerDocumentPair,
  normalizeDancerValues,
  writeDancerGuardingDocument,
  type DancerDocumentType,
  type DancerNameInput,
} from "@/lib/dancers/dancer-records.server";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
import {
  applyDancerBirthDateCorrection,
  emptyDancerBirthDateCorrectionReport,
  loadLinkedChoreographyEventBasesForDancerBirthDateCorrection,
  runDancerWriteWithBirthDateCorrection,
  type DancerBirthDateScheduleMove,
} from "@/lib/choreographies/dancer-birthdate-correction.server";
import type { EventBases } from "@/lib/events/bases.server";
import { buildDancerEventParticipationSql } from "@/lib/participation/participation.server";
import { activeRosterPerson } from "@/lib/roster/roster-person-status.server";
import { findDancerNameWarning } from "@/lib/roster/roster-name-duplicates.server";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";
import {
  type ParticipationStatus,
  toParticipationStatus,
} from "@/lib/participation/participation.shared";

export type PortalDancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  birthDate: string;
  documentType: string | null;
  documentNumber: string | null;
  verificationStatus: DancerVerificationStatus;
  participationStatus: ParticipationStatus;
};

export type CreateDancerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  // Optional, so the document rule acts from the first save without making a
  // document required to load a dancer (PRD #1090).
  documentType: string;
  documentNumber: string;
};

export type UpdateDancerInput = CreateDancerInput & {
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
};

type NormalizedCreateDancerInput = DancerNameInput & {
  documentType: DancerDocumentType | null;
  documentNumber: string | null;
};

type NormalizedUpdateDancerInput = NormalizedCreateDancerInput & {
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
};

type DancerImageField =
  "documentFrontImageStorageKey" | "documentBackImageStorageKey";

export type CreateDancerResult =
  | { ok: true; dancer: typeof dancers.$inferSelect }
  | { ok: false; warning: RosterNameWarning }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<keyof CreateDancerInput, string>>;
      values: CreateDancerInput;
      // The dancer already holding the document number, so the form can link
      // to them when the match is an archived one.
      duplicateDocumentDancerId?: string;
    };

export type UpdateDancerField = keyof UpdateDancerInput;
export type UpdateDancerResult =
  | {
      ok: true;
      dancer: typeof dancers.$inferSelect;
      // What the birth-date correction moved to another schedule, for the
      // success feedback to name.
      scheduleMoves: DancerBirthDateScheduleMove[];
      recategorisedChoreographies: RecategorisedChoreography[];
    }
  | { ok: false; warning: RosterNameWarning }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<UpdateDancerField, string>>;
      values: UpdateDancerInput;
      // The dancer already holding the document number, so the form can link
      // to them when the match is an archived one.
      duplicateDocumentDancerId?: string;
    };

export async function listDancersForAcademy(
  academyId: string,
  options: {
    selectedEventId?: string | null;
  } = {},
): Promise<PortalDancerListItem[]> {
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
    .where(eq(dancers.academyId, academyId))
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
    .where(and(eq(dancers.academyId, academyId), activeRosterPerson(dancers)));

  return Number(count);
}

export async function createDancerForAcademy(
  academyId: string,
  input: CreateDancerInput,
  options: { acknowledgedDuplicateIds?: readonly string[] } = {},
): Promise<CreateDancerResult> {
  const validation = await validateCreateDancerInput(academyId, input);

  if (!validation.ok) {
    return validation;
  }

  // After the document pre-check, so a refusal always wins over a warning.
  const nameWarning = await findDancerNameWarning({
    academyId,
    acknowledgedDuplicateIds: options.acknowledgedDuplicateIds ?? [],
    birthDate: validation.input.birthDate,
    firstName: validation.input.firstName,
    lastName: validation.input.lastName,
    scope: "portal",
  });

  if (nameWarning) {
    return { ok: false, warning: nameWarning };
  }

  const { documentType, documentNumber } = validation.input;
  // The index can still refuse the number between the pre-check and the
  // insert.
  const guarded = await writeDancerGuardingDocument({
    academyId,
    documentNumber,
    scope: "portal",
    write: async () => {
      const [dancer] = await db
        .insert(dancers)
        .values({
          academyId,
          firstName: validation.input.firstName,
          lastName: validation.input.lastName,
          birthDate: validation.input.birthDate,
          documentType,
          documentNumber,
          active: true,
        })
        .returning();

      return dancer;
    },
  });

  if (!guarded.ok) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: { documentNumber: guarded.conflict.message },
      values: toCreateDancerValues(input),
      ...(guarded.conflict.dancerId
        ? { duplicateDocumentDancerId: guarded.conflict.dancerId }
        : {}),
    };
  }

  return { ok: true, dancer: guarded.result };
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
  options: { acknowledgedDuplicateIds?: readonly string[] } = {},
): Promise<UpdateDancerResult> {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const validation = await validateUpdateDancerInput(dancer, input);

  if (!validation.ok) {
    return validation;
  }

  // After the document pre-check, so a refusal always wins over a warning.
  const nameWarning = await findDancerNameWarning({
    academyId,
    acknowledgedDuplicateIds: options.acknowledgedDuplicateIds ?? [],
    birthDate: validation.input.birthDate,
    dancerId,
    firstName: validation.input.firstName,
    lastName: validation.input.lastName,
    scope: "portal",
  });

  if (nameWarning) {
    return { ok: false, warning: nameWarning };
  }

  const birthDateChanged = dancer.birthDate !== validation.input.birthDate;
  // Read before the transaction opens: the correction requires the bases, and
  // reading them from the pool inside its transaction would hold two
  // connections at once.
  const linkedChoreographyEventBases: Map<string, EventBases> = birthDateChanged
    ? await loadLinkedChoreographyEventBasesForDancerBirthDateCorrection({
        dancerId: dancer.id,
      })
    : new Map();
  // The dancer update and the recalculation share one transaction, so a
  // correction that leaves a choreography without a category rolls the dancer
  // row back as well.
  // The index can still refuse the number between the pre-check and the write.
  const guarded = await writeDancerGuardingDocument({
    academyId,
    dancerId,
    documentNumber: validation.input.documentNumber,
    scope: "portal",
    write: () =>
      runDancerWriteWithBirthDateCorrection(async (tx) => {
        const [savedDancer] = await tx
          .update(dancers)
          .set({
            firstName: validation.input.firstName,
            lastName: validation.input.lastName,
            birthDate: validation.input.birthDate,
            documentType: validation.input.documentType,
            documentNumber: validation.input.documentNumber,
            documentFrontImageStorageKey:
              validation.input.documentFrontImageStorageKey,
            documentBackImageStorageKey:
              validation.input.documentBackImageStorageKey,
            identityVerifiedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(dancers.id, dancerId), eq(dancers.academyId, academyId)),
          )
          .returning();

        const correction = birthDateChanged
          ? await applyDancerBirthDateCorrection({
              dancerId: dancer.id,
              executor: tx,
              eventBasesByEventId: linkedChoreographyEventBases,
            })
          : emptyDancerBirthDateCorrectionReport;

        return { savedDancer, ...correction };
      }),
  });

  if (!guarded.ok) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: { documentNumber: guarded.conflict.message },
      values: input,
      duplicateDocumentDancerId: guarded.conflict.dancerId,
    };
  }

  const write = guarded.result;

  if (!write.ok) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: { birthDate: write.birthDateMessage },
      values: input,
    };
  }

  return {
    ok: true,
    dancer: write.result.savedDancer,
    scheduleMoves: write.result.scheduleMoves,
    recategorisedChoreographies: write.result.recategorisedChoreographies,
  };
}

async function validateCreateDancerInput(
  academyId: string,
  input: CreateDancerInput,
): Promise<
  | { ok: true; input: NormalizedCreateDancerInput }
  | Extract<CreateDancerResult, { ok: false }>
> {
  const normalizedValues = normalizePortalDancerValues(input);
  const values = toCreateDancerValues(input);
  const fieldErrors: Partial<Record<keyof CreateDancerInput, string>> = {
    ...normalizedValues.fieldErrors,
  };
  const document = normalizeDancerDocumentPair(
    values.documentType,
    values.documentNumber,
  );

  if (!document.ok) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: { ...fieldErrors, ...document.fieldErrors },
      values,
    };
  }

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors,
      values,
    };
  }

  const documentConflict =
    document.documentNumber === null
      ? null
      : await findDancerDocumentConflict({
          academyId,
          documentNumber: document.documentNumber,
          scope: "portal",
        });

  if (documentConflict) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: { documentNumber: documentConflict.message },
      values,
      ...(documentConflict.dancerId
        ? { duplicateDocumentDancerId: documentConflict.dancerId }
        : {}),
    };
  }

  return {
    ok: true,
    input: {
      firstName: normalizedValues.firstName,
      lastName: normalizedValues.lastName,
      birthDate: normalizedValues.birthDate,
      documentType: document.documentType,
      documentNumber: document.documentNumber,
    },
  };
}

function toCreateDancerValues(input: CreateDancerInput): CreateDancerInput {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: input.birthDate.trim(),
    documentType: input.documentType.trim(),
    documentNumber: input.documentNumber,
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

  const documentConflict =
    normalizedDocument.documentNumber === null
      ? null
      : await findDancerDocumentConflict({
          academyId: dancer.academyId,
          dancerId: dancer.id,
          documentNumber: normalizedDocument.documentNumber,
          scope: "portal",
        });

  if (documentConflict) {
    fieldErrors.documentNumber = documentConflict.message;
  }

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors,
      values,
      ...(documentConflict
        ? { duplicateDocumentDancerId: documentConflict.dancerId }
        : {}),
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

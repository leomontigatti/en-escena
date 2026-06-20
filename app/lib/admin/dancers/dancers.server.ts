import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  administrativeAuditEntries,
  choreographies,
  choreographyDancers,
  dancers,
  scheduleCapacities,
  schedules,
  user,
} from "@/db/schema";
import { getDancerVerificationStatus } from "@/lib/dancers/verification";
import { resolveApplicablePrice } from "@/lib/events/bases-repository.server";
import {
  adminDancerCorrectionReasonMessage,
  adminDancerPageSize,
  type AdministrativeDancerAuditAction,
  type AdminDancerNameOrder,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
  type AdministrativeDancerListFilters,
  readAdminDancerIdentificationFilter,
  readAdminDancerParticipationFilter,
  readAdminDancerStatusFilter,
} from "@/lib/admin/dancers/dancers.shared";
import {
  findDuplicateDancerDocument,
  type DancerEditableSnapshot,
  normalizeDancerDocumentPair,
  normalizeDancerValues,
} from "@/lib/portal/dancer-records.server";
import {
  buildDancerAnyEventParticipationSql,
  buildDancerEventParticipationSql,
} from "@/lib/people/participation.server";

export type AdministrativeDancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  academyName: string;
  participationStatus: AdminDancerParticipationStatus;
  identificationStatus: AdminDancerIdentificationStatus;
};

export type AdministrativeDancerListResult = {
  filters: AdministrativeDancerListFilters;
  hasAnyDancer: boolean;
  items: AdministrativeDancerListItem[];
  totalCount: number;
  totalPages: number;
};

export type AdministrativeDancerDetail = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  active: boolean;
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  academy: {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
  };
  participationStatus: AdminDancerParticipationStatus;
  identificationStatus: AdminDancerIdentificationStatus;
  participatedInAnyEvent: boolean;
  correctionReasonRequired: boolean;
  inscriptions: AdministrativeDancerInscription[];
  choreographyNames: string[];
};

export type AdministrativeDancerInscription = {
  id: string;
  choreographyName: string;
  groupType: "solo" | "duo" | "trio" | "grupal";
  basePriceInCents: number | null;
  discountInCents: number;
  estimatedSubtotalInCents: number | null;
};

export type AdministrativeDancerUpdateInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey: string;
  documentBackImageStorageKey: string;
  correctionReason: string;
};

export type AdministrativeDancerStatusInput = {
  correctionReason: string;
};

export type AdministrativeDancerFieldErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "birthDate"
    | "documentType"
    | "documentNumber"
    | "documentFrontImageStorageKey"
    | "documentBackImageStorageKey"
    | "correctionReason",
    string
  >
>;

export type AdministrativeDancerMutationResult =
  | {
      ok: true;
      dancer: DancerEditableSnapshot;
      verificationInvalidated: boolean;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: AdministrativeDancerFieldErrors;
      values: AdministrativeDancerUpdateInput;
    };

type AdministrativeDancerStatusMutationResult =
  | {
      ok: true;
      dancer: DancerEditableSnapshot;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: Pick<AdministrativeDancerFieldErrors, "correctionReason">;
      values: AdministrativeDancerStatusInput;
    };

export function readAdministrativeDancerFilters(
  searchParams: URLSearchParams,
  options: { hasSelectedEvent: boolean },
): AdministrativeDancerListFilters {
  return {
    nameOrder: readDancerNameOrder(searchParams.get("orden")),
    participation: readAdminDancerParticipationFilter({
      value: searchParams.get("participando"),
      hasSelectedEvent: options.hasSelectedEvent,
    }),
    query: searchParams.get("q")?.trim() ?? "",
    status: readAdminDancerStatusFilter(searchParams.get("estado")),
    identification: readAdminDancerIdentificationFilter(
      searchParams.get("identificacion"),
    ),
    page: readPage(searchParams),
  };
}

export async function listAdministrativeDancers(input: {
  selectedEventId: string | null;
  filters: AdministrativeDancerListFilters;
}): Promise<AdministrativeDancerListResult> {
  const where = buildAdministrativeDancerWhere(input);

  const [{ count: totalUnfilteredCount }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId));

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .where(where);

  const totalCount = Number(count);
  const totalPages = Math.max(1, Math.ceil(totalCount / adminDancerPageSize));
  const page = Math.min(input.filters.page, totalPages);
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );
  const orderByName =
    input.filters.nameOrder === "desc"
      ? [
          desc(sql`lower(${dancers.firstName})`),
          desc(sql`lower(${dancers.lastName})`),
        ]
      : [
          asc(sql`lower(${dancers.firstName})`),
          asc(sql`lower(${dancers.lastName})`),
        ];

  const rows = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      active: dancers.active,
      academyName: academies.name,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      isParticipating: participationSql,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .where(where)
    .orderBy(...orderByName, asc(dancers.id))
    .limit(adminDancerPageSize)
    .offset((page - 1) * adminDancerPageSize);

  return {
    filters: {
      ...input.filters,
      page,
    },
    hasAnyDancer: Number(totalUnfilteredCount) > 0,
    items: rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      active: row.active,
      academyName: row.academyName,
      participationStatus: toParticipationStatus(
        input.selectedEventId,
        row.isParticipating,
      ),
      identificationStatus: toIdentificationStatus({
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        documentFrontImageStorageKey: row.documentFrontImageStorageKey,
        documentBackImageStorageKey: row.documentBackImageStorageKey,
        identityVerifiedAt: row.identityVerifiedAt,
      }),
    })),
    totalCount,
    totalPages,
  };
}

function readDancerNameOrder(value: string | null): AdminDancerNameOrder {
  return value === "nombre:desc" ? "desc" : "asc";
}

export async function findAdministrativeDancer(input: {
  dancerId: string;
  selectedEventId: string | null;
}): Promise<AdministrativeDancerDetail | null> {
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );

  const row = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
      active: dancers.active,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      createdAt: dancers.createdAt,
      updatedAt: dancers.updatedAt,
      academyId: academies.id,
      academyName: academies.name,
      academyContactName: academies.contactName,
      academyPhone: academies.phone,
      academyEmail: user.email,
      isParticipating: participationSql,
      hasParticipatedInAnyEvent: buildDancerAnyEventParticipationSql(),
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .innerJoin(user, eq(user.id, academies.userId))
    .where(eq(dancers.id, input.dancerId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) {
    return null;
  }

  const { choreographyRows, inscriptions } =
    await findAdministrativeDancerInscriptions({
      dancerId: input.dancerId,
      selectedEventId: input.selectedEventId,
    });

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    active: row.active,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    documentFrontImageStorageKey: row.documentFrontImageStorageKey,
    documentBackImageStorageKey: row.documentBackImageStorageKey,
    identityVerifiedAt: row.identityVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    academy: {
      id: row.academyId,
      name: row.academyName,
      contactName: row.academyContactName,
      email: row.academyEmail,
      phone: row.academyPhone,
    },
    participationStatus: toParticipationStatus(
      input.selectedEventId,
      row.isParticipating,
    ),
    identificationStatus: toIdentificationStatus({
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      documentFrontImageStorageKey: row.documentFrontImageStorageKey,
      documentBackImageStorageKey: row.documentBackImageStorageKey,
      identityVerifiedAt: row.identityVerifiedAt,
    }),
    participatedInAnyEvent: row.hasParticipatedInAnyEvent,
    correctionReasonRequired: isCorrectionReasonRequired({
      selectedEventId: input.selectedEventId,
      isParticipating: row.isParticipating,
      hasParticipatedInAnyEvent: row.hasParticipatedInAnyEvent,
      isVerified: row.identityVerifiedAt !== null,
    }),
    inscriptions,
    choreographyNames: choreographyRows.map(
      (choreography) => choreography.name,
    ),
  };
}

async function findAdministrativeDancerInscriptions(input: {
  dancerId: string;
  selectedEventId: string | null;
}) {
  if (input.selectedEventId === null) {
    return {
      choreographyRows: [],
      inscriptions: [],
    };
  }

  const selectedEventId = input.selectedEventId;
  const choreographyRows = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      groupType: choreographies.groupType,
      scheduleId: schedules.id,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .innerJoin(
      schedules,
      or(
        eq(choreographies.scheduleId, schedules.id),
        eq(scheduleCapacities.scheduleId, schedules.id),
      ),
    )
    .where(
      and(
        eq(choreographyDancers.dancerId, input.dancerId),
        eq(choreographies.eventId, selectedEventId),
      ),
    )
    .orderBy(asc(sql`lower(${choreographies.name})`));

  const inscriptions = await Promise.all(
    choreographyRows.map(async (choreography) => {
      const priceResult = await resolveApplicablePrice({
        eventId: selectedEventId,
        groupType: choreography.groupType,
        scheduleId: choreography.scheduleId,
      });
      const priceInCents = priceResult.ok ? priceResult.price.amount : null;

      return {
        id: choreography.id,
        choreographyName: choreography.name,
        groupType: choreography.groupType,
        basePriceInCents: priceInCents,
        discountInCents: 0,
        estimatedSubtotalInCents: priceInCents,
      } satisfies AdministrativeDancerInscription;
    }),
  );

  return {
    choreographyRows,
    inscriptions,
  };
}

export async function updateAdministrativeDancer(input: {
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
  values: AdministrativeDancerUpdateInput;
}): Promise<AdministrativeDancerMutationResult> {
  const existingDancer = await findAdministrativeDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const values = input.values;
  const fieldErrors: AdministrativeDancerFieldErrors = {};
  const normalizedValues = normalizeDancerValues(input.values);

  Object.assign(fieldErrors, normalizedValues.fieldErrors);

  const normalizedDocument = normalizeDancerDocumentPair(
    input.values.documentType,
    input.values.documentNumber,
  );
  const normalizedDocumentFrontImageStorageKey = normalizeOptionalStorageKey(
    input.values.documentFrontImageStorageKey,
  );
  const normalizedDocumentBackImageStorageKey = normalizeOptionalStorageKey(
    input.values.documentBackImageStorageKey,
  );

  if (!normalizedDocument.ok) {
    Object.assign(fieldErrors, normalizedDocument.fieldErrors);
  }

  const normalizedReason = validateAdministrativeDancerCorrectionReason({
    correctionReason: input.values.correctionReason,
    required: existingDancer.correctionReasonRequired,
  });
  const correctionReason = normalizedReason.ok
    ? normalizedReason.correctionReason
    : null;

  if (!normalizedReason.ok) {
    fieldErrors.correctionReason = normalizedReason.fieldError;
  }

  if (!normalizedDocument.ok || Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors,
      values,
    };
  }

  if (
    normalizedDocument.documentType !== null &&
    normalizedDocument.documentNumber !== null
  ) {
    const duplicateDancer = await findDuplicateDancerDocument({
      academyId: existingDancer.academyId,
      dancerId: existingDancer.id,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
    });

    if (duplicateDancer) {
      return {
        ok: false,
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentNumber:
            "Ya existe un Bailarín con ese documento en la academia.",
        },
        values,
      };
    }
  }

  const beforeValues = toDancerSnapshot(existingDancer);
  const [updatedDancer] = await db
    .update(dancers)
    .set({
      firstName: normalizedValues.firstName,
      lastName: normalizedValues.lastName,
      birthDate: normalizedValues.birthDate,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
      documentFrontImageStorageKey:
        normalizedDocument.documentType === null
          ? null
          : normalizedDocumentFrontImageStorageKey,
      documentBackImageStorageKey:
        normalizedDocument.documentType === null
          ? null
          : normalizedDocumentBackImageStorageKey,
      identityVerifiedAt: existingDancer.identityVerifiedAt ? null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const afterValues = toDancerSnapshot(updatedDancer);

  await insertAdministrativeDancerAuditEntry({
    action: "update",
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    dancerId: existingDancer.id,
    eventId: input.selectedEventId,
    reason:
      correctionReason && correctionReason.length > 0 ? correctionReason : null,
  });

  return {
    ok: true,
    dancer: afterValues,
    verificationInvalidated: existingDancer.identityVerifiedAt !== null,
  };
}

export async function verifyAdministrativeDancerIdentity(input: {
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
}) {
  const existingDancer = await findAdministrativeDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  if (
    existingDancer.identificationStatus !== "pending-verification" &&
    existingDancer.identificationStatus !== "missing-images"
  ) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const beforeValues = toDancerSnapshot(existingDancer);
  const [updatedDancer] = await db
    .update(dancers)
    .set({
      identityVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const afterValues = toDancerSnapshot(updatedDancer);

  await insertAdministrativeDancerAuditEntry({
    action: "verify-identity",
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    dancerId: existingDancer.id,
    eventId: input.selectedEventId,
    reason: null,
  });

  return {
    ok: true as const,
    dancer: afterValues,
  };
}

export async function setAdministrativeDancerActiveState(input: {
  action: "archive" | "reactivate";
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
  correctionReason: string;
}): Promise<AdministrativeDancerStatusMutationResult> {
  const existingDancer = await findAdministrativeDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const normalizedReason = validateAdministrativeDancerCorrectionReason({
    correctionReason: input.correctionReason,
    required: existingDancer.correctionReasonRequired,
  });
  const correctionReason = normalizedReason.ok
    ? normalizedReason.correctionReason
    : null;

  if (!normalizedReason.ok) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: {
        correctionReason: normalizedReason.fieldError,
      },
      values: {
        correctionReason: input.correctionReason,
      },
    };
  }

  const nextActive = input.action === "reactivate";
  const beforeValues = toDancerSnapshot(existingDancer);
  const [updatedDancer] = await db
    .update(dancers)
    .set({
      active: nextActive,
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const afterValues = toDancerSnapshot(updatedDancer);

  await insertAdministrativeDancerAuditEntry({
    action: input.action,
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    dancerId: existingDancer.id,
    eventId: input.selectedEventId,
    reason:
      correctionReason && correctionReason.length > 0 ? correctionReason : null,
  });

  return {
    ok: true,
    dancer: afterValues,
  };
}

function buildAdministrativeDancerWhere(input: {
  selectedEventId: string | null;
  filters: AdministrativeDancerListFilters;
}) {
  const conditions: SQL[] = [];
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );

  if (input.filters.status === "active") {
    conditions.push(eq(dancers.active, true));
  } else if (input.filters.status === "archived") {
    conditions.push(eq(dancers.active, false));
  }

  if (input.selectedEventId !== null && input.filters.participation !== "all") {
    conditions.push(
      input.filters.participation === "yes"
        ? sql`${participationSql}`
        : sql`not ${participationSql}`,
    );
  }

  if (input.filters.identification === "incomplete") {
    conditions.push(sql`
      (
        ${dancers.documentType} is null
        or ${dancers.documentNumber} is null
        or ${dancers.documentFrontImageStorageKey} is null
        or ${dancers.documentBackImageStorageKey} is null
      )
    `);
  } else if (input.filters.identification === "pending-verification") {
    conditions.push(sql`
      ${dancers.documentType} is not null
      and ${dancers.documentNumber} is not null
      and ${dancers.documentFrontImageStorageKey} is not null
      and ${dancers.documentBackImageStorageKey} is not null
      and ${dancers.identityVerifiedAt} is null
    `);
  } else if (input.filters.identification === "verified") {
    conditions.push(sql`
      ${dancers.documentType} is not null
      and ${dancers.documentNumber} is not null
      and ${dancers.documentFrontImageStorageKey} is not null
      and ${dancers.documentBackImageStorageKey} is not null
      and ${dancers.identityVerifiedAt} is not null
    `);
  }

  if (input.filters.query.length > 0) {
    const search = `%${escapeForLike(input.filters.query)}%`;
    const searchCondition = or(
      ilike(dancers.firstName, search),
      ilike(dancers.lastName, search),
      ilike(sql`${dancers.firstName} || ' ' || ${dancers.lastName}`, search),
      ilike(sql`${dancers.lastName} || ' ' || ${dancers.firstName}`, search),
      ilike(dancers.documentNumber, search),
      ilike(academies.name, search),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): AdminDancerParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
}

async function findAdministrativeDancerForMutation(input: {
  dancerId: string;
  selectedEventId: string | null;
}) {
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );
  const anyEventParticipationSql = buildDancerAnyEventParticipationSql();

  return await db
    .select({
      id: dancers.id,
      academyId: dancers.academyId,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
      active: dancers.active,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      isParticipating: participationSql,
      hasParticipatedInAnyEvent: anyEventParticipationSql,
    })
    .from(dancers)
    .where(eq(dancers.id, input.dancerId))
    .limit(1)
    .then((rows) => rows[0] ?? null)
    .then((row) => {
      if (!row) {
        return null;
      }

      return {
        ...row,
        correctionReasonRequired: isCorrectionReasonRequired({
          selectedEventId: input.selectedEventId,
          isParticipating: row.isParticipating,
          hasParticipatedInAnyEvent: row.hasParticipatedInAnyEvent,
          isVerified: row.identityVerifiedAt !== null,
        }),
        identificationStatus: toIdentificationStatus(row),
      };
    });
}

function isCorrectionReasonRequired(input: {
  selectedEventId: string | null;
  isParticipating: boolean;
  hasParticipatedInAnyEvent: boolean;
  isVerified: boolean;
}) {
  if (input.isVerified) {
    return true;
  }

  if (input.selectedEventId !== null) {
    return input.isParticipating || input.hasParticipatedInAnyEvent;
  }

  return input.hasParticipatedInAnyEvent;
}

function validateAdministrativeDancerCorrectionReason(input: {
  correctionReason: string;
  required: boolean;
}) {
  const correctionReason = input.correctionReason.trim();

  if (
    !isCorrectionReasonLengthValid(correctionReason) &&
    (input.required || correctionReason.length > 0)
  ) {
    return {
      ok: false as const,
      fieldError: adminDancerCorrectionReasonMessage,
    };
  }

  return {
    ok: true as const,
    correctionReason,
  };
}

function isCorrectionReasonLengthValid(reason: string) {
  return reason.length >= 10 && reason.length <= 500;
}

function toDancerSnapshot(
  dancer: Pick<
    typeof dancers.$inferSelect,
    | "firstName"
    | "lastName"
    | "birthDate"
    | "documentType"
    | "documentNumber"
    | "documentFrontImageStorageKey"
    | "documentBackImageStorageKey"
    | "identityVerifiedAt"
    | "active"
  >,
): DancerEditableSnapshot {
  return {
    firstName: dancer.firstName,
    lastName: dancer.lastName,
    birthDate: dancer.birthDate,
    documentType: dancer.documentType,
    documentNumber: dancer.documentNumber,
    documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
    documentBackImageStorageKey: dancer.documentBackImageStorageKey,
    identityVerifiedAt: dancer.identityVerifiedAt?.toISOString() ?? null,
    active: dancer.active,
  };
}

async function insertAdministrativeDancerAuditEntry(input: {
  action: AdministrativeDancerAuditAction;
  adminUserId: string;
  afterValues: DancerEditableSnapshot;
  beforeValues: DancerEditableSnapshot;
  dancerId: string;
  eventId: string | null;
  reason: string | null;
}) {
  await db.insert(administrativeAuditEntries).values({
    entityType: "dancer",
    entityId: input.dancerId,
    eventId: input.eventId,
    adminUserId: input.adminUserId,
    action: input.action,
    reason: input.reason,
    beforeValues: input.beforeValues,
    afterValues: input.afterValues,
  });
}

function toIdentificationStatus(input: {
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
}): AdminDancerIdentificationStatus {
  const verificationStatus = getDancerVerificationStatus(input);

  switch (verificationStatus) {
    case "missingImages":
      return "pending-verification";
    case "unverified":
      return "pending-verification";
    default:
      return verificationStatus;
  }
}

function readPage(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page"));

  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

function escapeForLike(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function normalizeOptionalStorageKey(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}

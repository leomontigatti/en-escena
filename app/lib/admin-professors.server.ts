import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  administrativeAuditEntries,
  choreographies,
  choreographyProfessors,
  professors,
  user,
} from "@/db/schema";
import {
  adminProfessorCorrectionReasonMessage,
  adminProfessorPageSize,
  type AdministrativeProfessorAuditAction,
  type AdminProfessorParticipationStatus,
  type AdministrativeProfessorListFilters,
  readAdminProfessorParticipationFilter,
  readAdminProfessorStatusFilter,
} from "@/lib/admin-professors.shared";
import {
  findDuplicateProfessorDocument,
  type ProfessorEditableSnapshot,
  normalizeProfessorDocumentPair,
  normalizeProfessorNames,
} from "@/lib/professor-records.server";

export type AdministrativeProfessorListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  academyName: string;
  participationStatus: AdminProfessorParticipationStatus;
};

export type AdministrativeProfessorListResult = {
  filters: AdministrativeProfessorListFilters;
  items: AdministrativeProfessorListItem[];
  totalCount: number;
  totalPages: number;
};

export type AdministrativeProfessorDetail = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  documentType: (typeof professors.$inferSelect)["documentType"];
  documentNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  academy: {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string;
  };
  participationStatus: AdminProfessorParticipationStatus;
  participatedInAnyEvent: boolean;
  correctionReasonRequired: boolean;
  choreographyNames: string[];
};

export type AdministrativeProfessorUpdateInput = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  correctionReason: string;
};

export type AdministrativeProfessorFieldErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "documentType"
    | "documentNumber"
    | "correctionReason",
    string
  >
>;

export type AdministrativeProfessorMutationResult =
  | {
      ok: true;
      professor: ProfessorEditableSnapshot;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: AdministrativeProfessorFieldErrors;
      values: AdministrativeProfessorUpdateInput;
    };

type AdministrativeProfessorStatusMutationResult =
  | {
      ok: true;
      professor: ProfessorEditableSnapshot;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: Pick<AdministrativeProfessorFieldErrors, "correctionReason">;
    };

export function readAdministrativeProfessorFilters(
  searchParams: URLSearchParams,
  options: { hasSelectedEvent: boolean },
): AdministrativeProfessorListFilters {
  return {
    participation: readAdminProfessorParticipationFilter({
      value: searchParams.get("participando"),
      hasSelectedEvent: options.hasSelectedEvent,
    }),
    query: searchParams.get("q")?.trim() ?? "",
    status: readAdminProfessorStatusFilter(searchParams.get("estado")),
    page: readPage(searchParams),
  };
}

export async function listAdministrativeProfessors(input: {
  selectedEventId: string | null;
  filters: AdministrativeProfessorListFilters;
}): Promise<AdministrativeProfessorListResult> {
  const where = buildAdministrativeProfessorWhere(input);

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .where(where);

  const totalCount = Number(count);
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / adminProfessorPageSize),
  );
  const page = Math.min(input.filters.page, totalPages);
  const participationSql = buildParticipationSql(input.selectedEventId);

  const rows = await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
      academyName: academies.name,
      isParticipating: participationSql,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .where(where)
    .orderBy(
      asc(sql`lower(${professors.lastName})`),
      asc(sql`lower(${professors.firstName})`),
      asc(professors.id),
    )
    .limit(adminProfessorPageSize)
    .offset((page - 1) * adminProfessorPageSize);

  return {
    filters: {
      ...input.filters,
      page,
    },
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
    })),
    totalCount,
    totalPages,
  };
}

export async function findAdministrativeProfessor(input: {
  professorId: string;
  selectedEventId: string | null;
}): Promise<AdministrativeProfessorDetail | null> {
  const participationSql = buildParticipationSql(input.selectedEventId);

  const row = await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
      documentType: professors.documentType,
      documentNumber: professors.documentNumber,
      createdAt: professors.createdAt,
      updatedAt: professors.updatedAt,
      academyId: academies.id,
      academyName: academies.name,
      academyContactName: academies.contactName,
      academyPhone: academies.phone,
      academyEmail: user.email,
      isParticipating: participationSql,
      hasParticipatedInAnyEvent: buildAnyEventParticipationSql(),
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .innerJoin(user, eq(user.id, academies.userId))
    .where(eq(professors.id, input.professorId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) {
    return null;
  }

  const choreographyRows =
    input.selectedEventId === null
      ? []
      : await db
          .select({
            name: choreographies.name,
          })
          .from(choreographyProfessors)
          .innerJoin(
            choreographies,
            eq(choreographies.id, choreographyProfessors.choreographyId),
          )
          .where(
            and(
              eq(choreographyProfessors.professorId, input.professorId),
              eq(choreographies.eventId, input.selectedEventId),
            ),
          )
          .orderBy(asc(sql`lower(${choreographies.name})`));

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    active: row.active,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
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
    participatedInAnyEvent: row.hasParticipatedInAnyEvent,
    correctionReasonRequired: isCorrectionReasonRequired({
      selectedEventId: input.selectedEventId,
      isParticipating: row.isParticipating,
      hasParticipatedInAnyEvent: row.hasParticipatedInAnyEvent,
    }),
    choreographyNames: choreographyRows.map(
      (choreography) => choreography.name,
    ),
  };
}

export async function updateAdministrativeProfessor(input: {
  adminUserId: string;
  professorId: string;
  selectedEventId: string | null;
  values: AdministrativeProfessorUpdateInput;
}): Promise<AdministrativeProfessorMutationResult> {
  const existingProfessor = await findAdministrativeProfessorForMutation({
    professorId: input.professorId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingProfessor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const fieldErrors: AdministrativeProfessorFieldErrors = {};
  const values = {
    ...input.values,
    correctionReason: input.values.correctionReason,
  };
  const normalizedNames = normalizeProfessorNames(input.values);

  Object.assign(fieldErrors, normalizedNames.fieldErrors);

  const normalizedDocument = normalizeProfessorDocumentPair(
    input.values.documentType,
    input.values.documentNumber,
  );

  if (!normalizedDocument.ok) {
    Object.assign(fieldErrors, normalizedDocument.fieldErrors);
  }

  const normalizedReason = validateAdministrativeProfessorCorrectionReason({
    correctionReason: input.values.correctionReason,
    required: existingProfessor.correctionReasonRequired,
  });
  const correctionReason = normalizedReason.ok
    ? normalizedReason.correctionReason
    : null;

  if (!normalizedReason.ok) {
    fieldErrors.correctionReason = normalizedReason.fieldError;
  }

  if (!normalizedDocument.ok) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors,
      values,
    };
  }

  if (Object.keys(fieldErrors).length > 0) {
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
    const duplicateProfessor = await findDuplicateProfessorDocument({
      academyId: existingProfessor.academyId,
      professorId: existingProfessor.id,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
    });

    if (duplicateProfessor) {
      return {
        ok: false,
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentNumber:
            "Ya existe un Profesor con ese documento en la academia.",
        },
        values,
      };
    }
  }

  const beforeValues = toProfessorSnapshot(existingProfessor);
  const [updatedProfessor] = await db
    .update(professors)
    .set({
      firstName: normalizedNames.firstName,
      lastName: normalizedNames.lastName,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
      updatedAt: new Date(),
    })
    .where(eq(professors.id, existingProfessor.id))
    .returning();
  const afterValues = toProfessorSnapshot(updatedProfessor);

  await insertAdministrativeProfessorAuditEntry({
    action: "update",
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    eventId: input.selectedEventId,
    professorId: existingProfessor.id,
    reason:
      correctionReason && correctionReason.length > 0 ? correctionReason : null,
  });

  return {
    ok: true,
    professor: afterValues,
  };
}

export async function setAdministrativeProfessorActiveState(input: {
  action: "archive" | "reactivate";
  adminUserId: string;
  professorId: string;
  selectedEventId: string | null;
  correctionReason: string;
}): Promise<AdministrativeProfessorStatusMutationResult> {
  const existingProfessor = await findAdministrativeProfessorForMutation({
    professorId: input.professorId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingProfessor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const normalizedReason = validateAdministrativeProfessorCorrectionReason({
    correctionReason: input.correctionReason,
    required: existingProfessor.correctionReasonRequired,
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
    };
  }

  const nextActive = input.action === "reactivate";
  const beforeValues = toProfessorSnapshot(existingProfessor);
  const [updatedProfessor] = await db
    .update(professors)
    .set({
      active: nextActive,
      updatedAt: new Date(),
    })
    .where(eq(professors.id, existingProfessor.id))
    .returning();
  const afterValues = toProfessorSnapshot(updatedProfessor);

  await insertAdministrativeProfessorAuditEntry({
    action: input.action,
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    eventId: input.selectedEventId,
    professorId: existingProfessor.id,
    reason:
      correctionReason && correctionReason.length > 0 ? correctionReason : null,
  });

  return {
    ok: true,
    professor: afterValues,
  };
}

function buildAdministrativeProfessorWhere(input: {
  selectedEventId: string | null;
  filters: AdministrativeProfessorListFilters;
}) {
  const conditions: SQL[] = [];
  const participationSql = buildParticipationSql(input.selectedEventId);

  if (input.filters.status === "active") {
    conditions.push(eq(professors.active, true));
  } else if (input.filters.status === "archived") {
    conditions.push(eq(professors.active, false));
  }

  if (input.selectedEventId !== null && input.filters.participation !== "all") {
    conditions.push(
      input.filters.participation === "yes"
        ? sql`${participationSql}`
        : sql`not ${participationSql}`,
    );
  }

  if (input.filters.query.length > 0) {
    const search = `%${escapeForLike(input.filters.query)}%`;
    const searchCondition = or(
      ilike(professors.firstName, search),
      ilike(professors.lastName, search),
      ilike(
        sql`${professors.firstName} || ' ' || ${professors.lastName}`,
        search,
      ),
      ilike(
        sql`${professors.lastName} || ' ' || ${professors.firstName}`,
        search,
      ),
      ilike(professors.documentNumber, search),
      ilike(academies.name, search),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildParticipationSql(selectedEventId: string | null) {
  if (selectedEventId === null) {
    return sql<boolean>`false`;
  }

  return sql<boolean>`exists (
    select 1
    from ${choreographyProfessors}
    inner join ${choreographies}
      on ${choreographies.id} = ${choreographyProfessors.choreographyId}
    where ${choreographyProfessors.professorId} = ${professors.id}
      and ${choreographies.eventId} = ${selectedEventId}
  )`;
}

function buildAnyEventParticipationSql() {
  return sql<boolean>`exists (
    select 1
    from ${choreographyProfessors}
    inner join ${choreographies}
      on ${choreographies.id} = ${choreographyProfessors.choreographyId}
    where ${choreographyProfessors.professorId} = ${professors.id}
  )`;
}

function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): AdminProfessorParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
}

async function findAdministrativeProfessorForMutation(input: {
  professorId: string;
  selectedEventId: string | null;
}) {
  const participationSql = buildParticipationSql(input.selectedEventId);
  const anyEventParticipationSql = buildAnyEventParticipationSql();

  return await db
    .select({
      id: professors.id,
      academyId: professors.academyId,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
      documentType: professors.documentType,
      documentNumber: professors.documentNumber,
      isParticipating: participationSql,
      hasParticipatedInAnyEvent: anyEventParticipationSql,
    })
    .from(professors)
    .where(eq(professors.id, input.professorId))
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
        }),
      };
    });
}

function isCorrectionReasonRequired(input: {
  selectedEventId: string | null;
  isParticipating: boolean;
  hasParticipatedInAnyEvent: boolean;
}) {
  if (input.selectedEventId !== null) {
    return input.isParticipating || input.hasParticipatedInAnyEvent;
  }

  return input.hasParticipatedInAnyEvent;
}

function isCorrectionReasonLengthValid(reason: string) {
  return reason.length >= 10 && reason.length <= 500;
}

function validateAdministrativeProfessorCorrectionReason(input: {
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
      fieldError: adminProfessorCorrectionReasonMessage,
    };
  }

  return {
    ok: true as const,
    correctionReason,
  };
}

function toProfessorSnapshot(
  professor: Pick<
    typeof professors.$inferSelect,
    "firstName" | "lastName" | "documentType" | "documentNumber" | "active"
  >,
): ProfessorEditableSnapshot {
  return {
    firstName: professor.firstName,
    lastName: professor.lastName,
    documentType: professor.documentType,
    documentNumber: professor.documentNumber,
    active: professor.active,
  };
}

async function insertAdministrativeProfessorAuditEntry(input: {
  action: AdministrativeProfessorAuditAction;
  adminUserId: string;
  afterValues: ProfessorEditableSnapshot;
  beforeValues: ProfessorEditableSnapshot;
  eventId: string | null;
  professorId: string;
  reason: string | null;
}) {
  await db.insert(administrativeAuditEntries).values({
    entityType: "professor",
    entityId: input.professorId,
    eventId: input.eventId,
    adminUserId: input.adminUserId,
    action: input.action,
    reason: input.reason,
    beforeValues: input.beforeValues,
    afterValues: input.afterValues,
  });
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

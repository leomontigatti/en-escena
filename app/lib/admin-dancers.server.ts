import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  dancers,
  user,
} from "@/db/schema";
import {
  adminDancerPageSize,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
  type AdministrativeDancerListFilters,
  readAdminDancerIdentificationFilter,
  readAdminDancerParticipationFilter,
  readAdminDancerStatusFilter,
} from "@/lib/admin-dancers.shared";

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
  choreographyNames: string[];
};

export function readAdministrativeDancerFilters(
  searchParams: URLSearchParams,
  options: { hasSelectedEvent: boolean },
): AdministrativeDancerListFilters {
  return {
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
  const participationSql = buildParticipationSql(input.selectedEventId);

  const rows = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      active: dancers.active,
      academyName: academies.name,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      isParticipating: participationSql,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .where(where)
    .orderBy(
      asc(sql`lower(${dancers.lastName})`),
      asc(sql`lower(${dancers.firstName})`),
      asc(dancers.id),
    )
    .limit(adminDancerPageSize)
    .offset((page - 1) * adminDancerPageSize);

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
      identificationStatus: toIdentificationStatus({
        documentType: row.documentType,
        documentNumber: row.documentNumber,
      }),
    })),
    totalCount,
    totalPages,
  };
}

export async function findAdministrativeDancer(input: {
  dancerId: string;
  selectedEventId: string | null;
}): Promise<AdministrativeDancerDetail | null> {
  const participationSql = buildParticipationSql(input.selectedEventId);

  const row = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
      active: dancers.active,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      createdAt: dancers.createdAt,
      updatedAt: dancers.updatedAt,
      academyId: academies.id,
      academyName: academies.name,
      academyContactName: academies.contactName,
      academyPhone: academies.phone,
      academyEmail: user.email,
      isParticipating: participationSql,
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

  const choreographyRows =
    input.selectedEventId === null
      ? []
      : await db
          .select({
            name: choreographies.name,
          })
          .from(choreographyDancers)
          .innerJoin(
            choreographies,
            eq(choreographies.id, choreographyDancers.choreographyId),
          )
          .where(
            and(
              eq(choreographyDancers.dancerId, input.dancerId),
              eq(choreographies.eventId, input.selectedEventId),
            ),
          )
          .orderBy(asc(sql`lower(${choreographies.name})`));

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
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
    identificationStatus: toIdentificationStatus({
      documentType: row.documentType,
      documentNumber: row.documentNumber,
    }),
    choreographyNames: choreographyRows.map(
      (choreography) => choreography.name,
    ),
  };
}

function buildAdministrativeDancerWhere(input: {
  selectedEventId: string | null;
  filters: AdministrativeDancerListFilters;
}) {
  const conditions: SQL[] = [];
  const participationSql = buildParticipationSql(input.selectedEventId);

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
    conditions.push(
      or(
        sql`${dancers.documentType} is null`,
        sql`${dancers.documentNumber} is null`,
      )!,
    );
  } else if (input.filters.identification === "missing-images") {
    conditions.push(
      and(
        sql`${dancers.documentType} is not null`,
        sql`${dancers.documentNumber} is not null`,
      )!,
    );
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

function buildParticipationSql(selectedEventId: string | null) {
  if (selectedEventId === null) {
    return sql<boolean>`false`;
  }

  return sql<boolean>`exists (
    select 1
    from ${choreographyDancers}
    inner join ${choreographies}
      on ${choreographies.id} = ${choreographyDancers.choreographyId}
    where ${choreographyDancers.dancerId} = ${dancers.id}
      and ${choreographies.eventId} = ${selectedEventId}
  )`;
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

function toIdentificationStatus(input: {
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
}): AdminDancerIdentificationStatus {
  if (!input.documentType || !input.documentNumber) {
    return "incomplete";
  }

  return "missing-images";
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

import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyProfessors,
  professors,
  user,
} from "@/db/schema";
import {
  adminProfessorPageSize,
  type AdminProfessorParticipationStatus,
  type AdministrativeProfessorListFilters,
  readAdminProfessorParticipationFilter,
  readAdminProfessorStatusFilter,
} from "@/lib/admin-professors.shared";

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
  choreographyNames: string[];
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
    choreographyNames: choreographyRows.map(
      (choreography) => choreography.name,
    ),
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

function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): AdminProfessorParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
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

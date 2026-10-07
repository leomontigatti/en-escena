import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { findProfessorNameWarning } from "@/lib/roster/roster-name-duplicates.server";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";
import {
  academies,
  choreographies,
  choreographyProfessors,
  professors,
  user,
} from "@/db/schema";
import {
  professorListSpec,
  type ProfessorListFilters,
  readProfessorParticipationFilter,
} from "@/lib/admin/professors/professors.shared";
import { adminListPageSize } from "@/lib/admin/admin-list";
import { paginateList, readListQuery } from "@/lib/list-query/list-query";
import { listSearchCondition } from "@/lib/list-query/list-query.server";
import {
  findProfessorDocumentConflict,
  writeProfessorGuardingDocument,
  type ProfessorEditableSnapshot,
  normalizeProfessorDocumentPair,
  normalizeProfessorNames,
} from "@/lib/portal/professor-records.server";
import {
  buildProfessorAnyEventParticipationSql,
  buildProfessorEventParticipationSql,
} from "@/lib/participation/participation.server";
import {
  type ParticipationStatus,
  toParticipationStatus,
} from "@/lib/participation/participation.shared";
import { readRosterPersonStatusFilter } from "@/lib/roster/roster-person-status.shared";
import {
  keepKnownChoreographyDay,
  listEventChoreographyDays,
  readChoreographyDayFilter,
  type ChoreographyDayOption,
} from "@/lib/choreographies/choreography-days.server";
import {
  activeRosterPerson,
  rosterPersonStatusCondition,
} from "@/lib/roster/roster-person-status.server";
import { orderByChoreographyName } from "@/lib/choreographies/choreography-name.server";

export type ProfessorListItem = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  academyName: string;
  participationStatus: ParticipationStatus;
  identificationStatus: "complete" | "incomplete";
};

export type ProfessorListResult = {
  /** The days the selected event's choreographies fall on; none without one. */
  dayOptions: ChoreographyDayOption[];
  filters: ProfessorListFilters;
  hasAnyProfessor: boolean;
  items: ProfessorListItem[];
  totalCount: number;
  totalPages: number;
};

export type ProfessorDetail = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  isIncomplete: boolean;
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
  participationStatus: ParticipationStatus;
  participatedInAnyEvent: boolean;
  editConsequence: ProfessorEditConsequence;
  choreographyNames: string[];
};

export type ProfessorUpdateInput = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
};

export type ProfessorFieldErrors = Partial<
  Record<"firstName" | "lastName" | "documentType" | "documentNumber", string>
>;

export type ProfessorMutationResult =
  | {
      ok: true;
      professor: ProfessorEditableSnapshot;
    }
  | { ok: false; warning: RosterNameWarning }
  | {
      ok: false;
      message: string;
      fieldErrors: ProfessorFieldErrors;
      values: ProfessorUpdateInput;
      // The professor already holding the document number, so the form can
      // link to them when the match is an archived one.
      duplicateDocumentProfessorId?: string;
    };

export function readProfessorFilters(
  searchParams: URLSearchParams,
): ProfessorListFilters {
  const listQuery = readListQuery(searchParams, professorListSpec);

  return {
    day: readChoreographyDayFilter(searchParams),
    order: listQuery.order,
    participation: readProfessorParticipationFilter(
      searchParams.get("participando"),
    ),
    query: listQuery.search,
    status: readRosterPersonStatusFilter(searchParams),
    page: listQuery.page,
  };
}

export async function listProfessors(input: {
  selectedEventId: string | null;
  filters: ProfessorListFilters;
}): Promise<ProfessorListResult> {
  const dayOptions =
    input.selectedEventId === null
      ? []
      : await listEventChoreographyDays(input.selectedEventId);
  const filters: ProfessorListFilters = {
    ...input.filters,
    day: keepKnownChoreographyDay(input.filters.day, dayOptions),
  };
  const where = buildProfessorWhere({
    selectedEventId: input.selectedEventId,
    filters,
  });

  const [{ count: totalUnfilteredCount }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId));

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .where(where);

  const totalCount = Number(count);
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount,
  });
  const participationSql = buildProfessorEventParticipationSql(
    input.selectedEventId,
  );
  const orderByName =
    filters.order.direction === "desc"
      ? [
          desc(sql`lower(${professors.firstName})`),
          desc(sql`lower(${professors.lastName})`),
        ]
      : [
          asc(sql`lower(${professors.firstName})`),
          asc(sql`lower(${professors.lastName})`),
        ];

  const rows = await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
      academyName: academies.name,
      documentType: professors.documentType,
      documentNumber: professors.documentNumber,
      isParticipating: participationSql,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .where(where)
    .orderBy(...orderByName, asc(professors.id))
    .limit(limit)
    .offset(offset);

  return {
    dayOptions,
    filters: {
      ...filters,
      page,
    },
    hasAnyProfessor: Number(totalUnfilteredCount) > 0,
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
      identificationStatus:
        row.documentType && row.documentNumber ? "complete" : "incomplete",
    })),
    totalCount,
    totalPages,
  };
}

/** One `accreditation` to print: the professor's name and their academy. */
export type ProfessorAccreditation = {
  id: string;
  firstName: string;
  lastName: string;
  academyName: string;
};

/**
 * The professors to print an `accreditation` for: the ticked ones when ids are
 * given, otherwise every one the list's filters match, with no page. One per
 * `professor` row, so a person in two academies gets two. Archived professors
 * never print, whatever was asked, and the sheet runs by academy, then last
 * name, then first name, so each academy's passes come out together.
 */
export async function listProfessorAccreditations(input: {
  selectedEventId: string | null;
  selection: { professorIds: string[] } | { filters: ProfessorListFilters };
}): Promise<ProfessorAccreditation[]> {
  const selectionCondition =
    "professorIds" in input.selection
      ? inArray(professors.id, input.selection.professorIds)
      : buildProfessorWhere({
          selectedEventId: input.selectedEventId,
          filters: input.selection.filters,
        });

  return await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      academyName: academies.name,
    })
    .from(professors)
    .innerJoin(academies, eq(academies.id, professors.academyId))
    .where(and(activeRosterPerson(professors), selectionCondition))
    .orderBy(
      asc(sql`lower(${academies.name})`),
      asc(sql`lower(${professors.lastName})`),
      asc(sql`lower(${professors.firstName})`),
      asc(professors.id),
    );
}

export async function findProfessor(input: {
  professorId: string;
  selectedEventId: string | null;
}): Promise<ProfessorDetail | null> {
  const participationSql = buildProfessorEventParticipationSql(
    input.selectedEventId,
  );

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
      hasParticipatedInAnyEvent: buildProfessorAnyEventParticipationSql(),
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
          .orderBy(...orderByChoreographyName(choreographies.name));

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    active: row.active,
    isIncomplete: row.documentType === null || row.documentNumber === null,
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
    editConsequence: getEditConsequence({
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
  acknowledgedDuplicateIds?: readonly string[];
  professorId: string;
  selectedEventId: string | null;
  values: ProfessorUpdateInput;
}): Promise<ProfessorMutationResult> {
  const existingProfessor = await findProfessorForMutation({
    professorId: input.professorId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingProfessor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const fieldErrors: ProfessorFieldErrors = {};
  const values = { ...input.values };
  const normalizedNames = normalizeProfessorNames(input.values);

  Object.assign(fieldErrors, normalizedNames.fieldErrors);

  const normalizedDocument = normalizeProfessorDocumentPair(
    input.values.documentType,
    input.values.documentNumber,
  );

  if (!normalizedDocument.ok) {
    Object.assign(fieldErrors, normalizedDocument.fieldErrors);
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

  const documentConflict =
    normalizedDocument.documentNumber === null
      ? null
      : await findProfessorDocumentConflict({
          academyId: existingProfessor.academyId,
          professorId: existingProfessor.id,
          documentNumber: normalizedDocument.documentNumber,
          scope: "admin",
        });

  if (documentConflict) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { documentNumber: documentConflict.message },
      values,
      duplicateDocumentProfessorId: documentConflict.professorId,
    };
  }

  // After the document pre-check, so a refusal always wins over a warning.
  const nameWarning = await findProfessorNameWarning({
    academyId: existingProfessor.academyId,
    acknowledgedDuplicateIds: input.acknowledgedDuplicateIds ?? [],
    firstName: normalizedNames.firstName,
    lastName: normalizedNames.lastName,
    professorId: existingProfessor.id,
    scope: "admin",
  });

  if (nameWarning) {
    return { ok: false, warning: nameWarning };
  }

  // The index can still refuse the number between the pre-check and the write.
  const guarded = await writeProfessorGuardingDocument({
    academyId: existingProfessor.academyId,
    professorId: existingProfessor.id,
    documentNumber: normalizedDocument.documentNumber,
    scope: "admin",
    write: async () => {
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

      return updatedProfessor;
    },
  });

  if (!guarded.ok) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { documentNumber: guarded.conflict.message },
      values,
      duplicateDocumentProfessorId: guarded.conflict.professorId,
    };
  }

  return {
    ok: true,
    professor: toProfessorSnapshot(guarded.result),
  };
}

function buildProfessorWhere(input: {
  selectedEventId: string | null;
  filters: ProfessorListFilters;
}) {
  const conditions: SQL[] = [];
  const participationSql = buildProfessorEventParticipationSql(
    input.selectedEventId,
  );

  const statusCondition = rosterPersonStatusCondition(
    professors,
    input.filters.status,
  );

  if (statusCondition) {
    conditions.push(statusCondition);
  }

  if (input.selectedEventId !== null && input.filters.participation !== "all") {
    conditions.push(
      input.filters.participation === "yes"
        ? sql`${participationSql}`
        : sql`not ${participationSql}`,
    );
  }

  if (input.selectedEventId !== null && input.filters.day !== null) {
    conditions.push(
      sql`${buildProfessorEventParticipationSql(input.selectedEventId, input.filters.day)}`,
    );
  }

  const searchCondition = listSearchCondition(input.filters.query, [
    professors.firstName,
    professors.lastName,
    sql`${professors.firstName} || ' ' || ${professors.lastName}`,
    sql`${professors.lastName} || ' ' || ${professors.firstName}`,
    professors.documentNumber,
    academies.name,
  ]);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function findProfessorForMutation(input: {
  professorId: string;
  selectedEventId: string | null;
}) {
  const participationSql = buildProfessorEventParticipationSql(
    input.selectedEventId,
  );
  const anyEventParticipationSql = buildProfessorAnyEventParticipationSql();

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

      return row;
    });
}

export type ProfessorEditConsequence = "participated" | null;

export function getEditConsequence(input: {
  selectedEventId: string | null;
  isParticipating: boolean;
  hasParticipatedInAnyEvent: boolean;
}): ProfessorEditConsequence {
  const participated =
    input.selectedEventId !== null
      ? input.isParticipating || input.hasParticipatedInAnyEvent
      : input.hasParticipatedInAnyEvent;

  return participated ? "participated" : null;
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

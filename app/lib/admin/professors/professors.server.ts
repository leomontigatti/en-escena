import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyProfessors,
  professors,
  user,
} from "@/db/schema";
import {
  professorPageSize,
  type ProfessorNameOrder,
  type ProfessorListFilters,
  readProfessorParticipationFilter,
  readProfessorStatusFilter,
} from "@/lib/admin/professors/professors.shared";
import {
  findDuplicateProfessorDocument,
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
  | {
      ok: false;
      message: string;
      fieldErrors: ProfessorFieldErrors;
      values: ProfessorUpdateInput;
    };

type ProfessorStatusMutationResult = {
  professor: ProfessorEditableSnapshot;
};

export function readProfessorFilters(
  searchParams: URLSearchParams,
): ProfessorListFilters {
  return {
    nameOrder: readProfessorNameOrder(searchParams.get("orden")),
    participation: readProfessorParticipationFilter(
      searchParams.get("participando"),
    ),
    query: searchParams.get("busqueda")?.trim() ?? "",
    status: readProfessorStatusFilter(searchParams.get("estado")),
    page: readPage(searchParams),
  };
}

export async function listProfessors(input: {
  selectedEventId: string | null;
  filters: ProfessorListFilters;
}): Promise<ProfessorListResult> {
  const where = buildProfessorWhere(input);

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
  const totalPages = Math.max(1, Math.ceil(totalCount / professorPageSize));
  const page = Math.min(input.filters.page, totalPages);
  const participationSql = buildProfessorEventParticipationSql(
    input.selectedEventId,
  );
  const orderByName =
    input.filters.nameOrder === "desc"
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
    .limit(professorPageSize)
    .offset((page - 1) * professorPageSize);

  return {
    filters: {
      ...input.filters,
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

function readProfessorNameOrder(value: string | null): ProfessorNameOrder {
  return value === "nombre:desc" ? "desc" : "asc";
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
          .orderBy(asc(sql`lower(${choreographies.name})`));

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
  const savedSnapshot = toProfessorSnapshot(updatedProfessor);

  return {
    ok: true,
    professor: savedSnapshot,
  };
}

export async function setProfessorActiveState(input: {
  action: "archive" | "reactivate";
  professorId: string;
  selectedEventId: string | null;
}): Promise<ProfessorStatusMutationResult> {
  const existingProfessor = await findProfessorForMutation({
    professorId: input.professorId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingProfessor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const nextActive = input.action === "reactivate";
  const [updatedProfessor] = await db
    .update(professors)
    .set({
      active: nextActive,
      updatedAt: new Date(),
    })
    .where(eq(professors.id, existingProfessor.id))
    .returning();
  const savedSnapshot = toProfessorSnapshot(updatedProfessor);

  return {
    professor: savedSnapshot,
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

function readPage(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("pagina"));

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

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { professors } from "@/db/schema";
import {
  findDuplicateProfessorDocument,
  normalizeProfessorDocumentPair,
  normalizeProfessorNames as normalizeProfessorNamesShared,
} from "@/lib/portal/professor-records.server";

export type ProfessorFormField = "firstName" | "lastName";

export type CreateProfessorInput = Record<ProfessorFormField, string>;

export type UpdateProfessorInput = CreateProfessorInput & {
  documentType: string;
  documentNumber: string;
};

export type ProfessorListItem = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "active" | "documentType" | "documentNumber"
> & {
  isIncomplete: boolean;
};

export type CreateProfessorResult =
  | { ok: true; professor: typeof professors.$inferSelect }
  | {
      ok: false;
      message: string;
      fieldErrors: Partial<Record<ProfessorFormField, string>>;
      values: CreateProfessorInput;
    };

export type UpdateProfessorField = keyof UpdateProfessorInput;
export type UpdateProfessorResult =
  | { ok: true; professor: typeof professors.$inferSelect }
  | {
      ok: false;
      message: string;
      fieldErrors: Partial<Record<UpdateProfessorField, string>>;
      values: UpdateProfessorInput;
    };

const reviewProfessorFieldsMessage = "Revisá los campos marcados.";
type ProfessorStatusFilter = "active" | "archived";

type ProfessorIdentityRow = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "active" | "documentType" | "documentNumber"
>;

export async function listAcademyProfessors(
  academyId: string,
  options: {
    status?: ProfessorStatusFilter;
  } = {},
): Promise<ProfessorListItem[]> {
  const status = options.status;
  const statusFilter =
    status === undefined
      ? undefined
      : eq(professors.active, status === "active");

  const rows = await db.query.professors.findMany({
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      active: true,
      documentType: true,
      documentNumber: true,
    },
    where: and(eq(professors.academyId, academyId), statusFilter),
    orderBy: [
      asc(sql`lower(${professors.lastName})`),
      asc(sql`lower(${professors.firstName})`),
    ],
  });

  return rows.map(toProfessorListItem);
}

export async function createAcademyProfessor(
  academyId: string,
  input: CreateProfessorInput,
): Promise<CreateProfessorResult> {
  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
  };
  const { firstName, lastName, fieldErrors } = normalizeProfessorNames(input);

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors,
      values,
    };
  }

  const [professor] = await db
    .insert(professors)
    .values({
      academyId,
      firstName,
      lastName,
      active: true,
    })
    .returning();

  return { ok: true, professor };
}

export async function findAcademyProfessor(
  academyId: string,
  professorId: string,
): Promise<ProfessorListItem | null> {
  const professor = await db.query.professors.findFirst({
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      active: true,
      documentType: true,
      documentNumber: true,
    },
    where: and(
      eq(professors.id, professorId),
      eq(professors.academyId, academyId),
    ),
  });

  if (!professor) {
    return null;
  }

  return toProfessorListItem(professor);
}

export async function updateAcademyProfessor(
  academyId: string,
  professorId: string,
  input: UpdateProfessorInput,
): Promise<UpdateProfessorResult> {
  const existingProfessor = await findAcademyProfessor(academyId, professorId);

  if (!existingProfessor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
    documentType: input.documentType,
    documentNumber: input.documentNumber,
  };
  const {
    firstName,
    lastName,
    fieldErrors: normalizedNameFieldErrors,
  } = normalizeProfessorNames(input);
  const fieldErrors: Partial<Record<UpdateProfessorField, string>> = {
    ...normalizedNameFieldErrors,
  };

  const normalizedDocument = normalizeProfessorDocumentPair(
    input.documentType,
    input.documentNumber,
  );

  if (!normalizedDocument.ok) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors: {
        ...fieldErrors,
        ...normalizedDocument.fieldErrors,
      },
      values,
    };
  }

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors,
      values,
    };
  }

  if (
    normalizedDocument.documentType !== null &&
    normalizedDocument.documentNumber !== null
  ) {
    const duplicateProfessor = await findDuplicateProfessorDocument({
      academyId,
      professorId,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
    });

    if (duplicateProfessor) {
      return {
        ok: false,
        message: reviewProfessorFieldsMessage,
        fieldErrors: {
          documentNumber:
            "Ya existe un Profesor con ese documento en tu academia.",
        },
        values,
      };
    }
  }

  const [professor] = await db
    .update(professors)
    .set({
      firstName,
      lastName,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
      updatedAt: new Date(),
    })
    .where(
      and(eq(professors.id, professorId), eq(professors.academyId, academyId)),
    )
    .returning();

  return { ok: true, professor };
}

export async function archiveAcademyProfessor(
  academyId: string,
  professorId: string,
) {
  return setProfessorActiveState(academyId, professorId, false);
}

export async function reactivateAcademyProfessor(
  academyId: string,
  professorId: string,
) {
  return setProfessorActiveState(academyId, professorId, true);
}

function toProfessorListItem(
  professor: ProfessorIdentityRow,
): ProfessorListItem {
  return {
    ...professor,
    isIncomplete:
      professor.documentType === null || professor.documentNumber === null,
  };
}

function normalizeProfessorNames(input: CreateProfessorInput) {
  return normalizeProfessorNamesShared(input);
}

function hasFieldErrors(fieldErrors: Record<string, string | undefined>) {
  return Object.keys(fieldErrors).length > 0;
}

async function setProfessorActiveState(
  academyId: string,
  professorId: string,
  active: boolean,
) {
  const professor = await findAcademyProfessor(academyId, professorId);

  if (!professor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const [updatedProfessor] = await db
    .update(professors)
    .set({
      active,
      updatedAt: new Date(),
    })
    .where(
      and(eq(professors.id, professorId), eq(professors.academyId, academyId)),
    )
    .returning();

  return updatedProfessor;
}

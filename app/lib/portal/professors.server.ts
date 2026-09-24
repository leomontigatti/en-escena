import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { professors } from "@/db/schema";
import {
  findProfessorDocumentConflict,
  writeProfessorGuardingDocument,
  normalizeProfessorDocumentPair,
  normalizeProfessorNames as normalizeProfessorNamesShared,
} from "@/lib/portal/professor-records.server";
import { buildProfessorEventParticipationSql } from "@/lib/participation/participation.server";
import {
  type ParticipationStatus,
  toParticipationStatus,
} from "@/lib/participation/participation.shared";

export type ProfessorFormField = "firstName" | "lastName";

export type CreateProfessorInput = Record<ProfessorFormField, string>;

export type UpdateProfessorInput = CreateProfessorInput & {
  documentType: string;
  documentNumber: string;
};

export type PortalProfessorListItem = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "active" | "documentType" | "documentNumber"
> & {
  isIncomplete: boolean;
  participationStatus: ParticipationStatus;
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
      // The professor already holding the document number, so the form can
      // link to them when the match is an archived one.
      duplicateDocumentProfessorId?: string;
    };

const reviewProfessorFieldsMessage = "Revisá los campos marcados.";
type ProfessorIdentityRow = Pick<
  typeof professors.$inferSelect,
  "id" | "firstName" | "lastName" | "active" | "documentType" | "documentNumber"
>;

export async function listAcademyProfessors(
  academyId: string,
  options: {
    selectedEventId?: string | null;
  } = {},
): Promise<PortalProfessorListItem[]> {
  const selectedEventId = options.selectedEventId ?? null;
  const rows = await db
    .select({
      id: professors.id,
      firstName: professors.firstName,
      lastName: professors.lastName,
      active: professors.active,
      documentType: professors.documentType,
      documentNumber: professors.documentNumber,
      isParticipating: buildProfessorEventParticipationSql(selectedEventId),
    })
    .from(professors)
    .where(eq(professors.academyId, academyId))
    .orderBy(
      asc(sql`lower(${professors.firstName})`),
      asc(sql`lower(${professors.lastName})`),
    );

  return rows.map((professor) =>
    toProfessorListItem(professor, selectedEventId),
  );
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
): Promise<PortalProfessorListItem | null> {
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

  return toProfessorListItem(professor, null);
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

  const documentConflict =
    normalizedDocument.documentNumber === null
      ? null
      : await findProfessorDocumentConflict({
          academyId,
          professorId,
          documentNumber: normalizedDocument.documentNumber,
          scope: "portal",
        });

  if (documentConflict) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors: { documentNumber: documentConflict.message },
      values,
      duplicateDocumentProfessorId: documentConflict.professorId,
    };
  }

  // The index can still refuse the number between the pre-check and the write.
  const guarded = await writeProfessorGuardingDocument({
    academyId,
    professorId,
    documentNumber: normalizedDocument.documentNumber,
    scope: "portal",
    write: async () => {
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
          and(
            eq(professors.id, professorId),
            eq(professors.academyId, academyId),
          ),
        )
        .returning();

      return professor;
    },
  });

  if (!guarded.ok) {
    return {
      ok: false,
      message: reviewProfessorFieldsMessage,
      fieldErrors: { documentNumber: guarded.conflict.message },
      values,
      duplicateDocumentProfessorId: guarded.conflict.professorId,
    };
  }

  return { ok: true, professor: guarded.result };
}

function toProfessorListItem(
  professor: ProfessorIdentityRow & { isParticipating?: boolean },
  selectedEventId: string | null,
): PortalProfessorListItem {
  return {
    ...professor,
    isIncomplete:
      professor.documentType === null || professor.documentNumber === null,
    participationStatus: toParticipationStatus(
      selectedEventId,
      professor.isParticipating ?? false,
    ),
  };
}

function normalizeProfessorNames(input: CreateProfessorInput) {
  return normalizeProfessorNamesShared(input);
}

function hasFieldErrors(fieldErrors: Record<string, string | undefined>) {
  return Object.keys(fieldErrors).length > 0;
}

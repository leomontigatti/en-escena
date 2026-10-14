import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { professors } from "@/db/schema";
import { isUniqueViolation } from "@/lib/shared/error-properties.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { toPersonLastName, toPersonName } from "@/lib/shared/person-name";
import type { RosterScope } from "@/lib/roster/roster-scope";

export type ProfessorNameInput = {
  firstName: string;
  lastName: string;
};

export type ProfessorEditableSnapshot = {
  firstName: string;
  lastName: string;
  documentType: (typeof professors.$inferSelect)["documentType"];
  documentNumber: string | null;
  active: boolean;
};

export function normalizeProfessorNames(input: ProfessorNameInput) {
  const firstName = toPersonName(input.firstName);
  const lastName = toPersonLastName(input.lastName);
  const fieldErrors: Partial<Record<keyof ProfessorNameInput, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = requiredFieldMessage;
  }

  if (!lastName) {
    fieldErrors.lastName = requiredFieldMessage;
  }

  return { firstName, lastName, fieldErrors };
}

const professorDocumentNumberUniqueIndex =
  "professor_academy_document_number_unique";

/** Whose academy the reader is looking at: their own, or any, from the panel. */

export type ProfessorDocumentConflict = {
  /**
   * The professor already holding the number, so the form can link to them.
   * Absent only when the index refused a write whose holder the follow-up
   * read could not name.
   */
  professorId?: string;
  message: string;
};

/**
 * The number alone is the key within an academy, whatever type it was loaded
 * under, and an archived professor still holds theirs (PRD #1090). The rule
 * never crosses to the dancers.
 */
async function findDuplicateProfessorDocument(input: {
  academyId: string;
  /** Absent while creating: there is no row to exclude yet. */
  professorId?: string;
  documentNumber: string;
}) {
  return await db.query.professors.findFirst({
    columns: { id: true, active: true },
    where: and(
      eq(professors.academyId, input.academyId),
      input.professorId ? ne(professors.id, input.professorId) : undefined,
      eq(professors.documentNumber, input.documentNumber),
    ),
  });
}

export async function findProfessorDocumentConflict(input: {
  academyId: string;
  professorId?: string;
  documentNumber: string;
  scope: RosterScope;
}): Promise<ProfessorDocumentConflict | null> {
  const duplicate = await findDuplicateProfessorDocument(input);

  if (!duplicate) {
    return null;
  }

  return {
    professorId: duplicate.id,
    message: professorDocumentConflictMessage({
      archived: !duplicate.active,
      scope: input.scope,
    }),
  };
}

/**
 * Runs a write that the unique index can refuse and maps that refusal to the
 * same field error the pre-check produces, so two saves landing at the same
 * instant never end in a server error.
 */
export async function writeProfessorGuardingDocument<T>(input: {
  academyId: string;
  professorId?: string;
  documentNumber: string | null;
  scope: RosterScope;
  write: () => Promise<T>;
}): Promise<
  { ok: true; result: T } | { ok: false; conflict: ProfessorDocumentConflict }
> {
  try {
    return { ok: true, result: await input.write() };
  } catch (error) {
    if (
      input.documentNumber === null ||
      !isUniqueViolation(error, professorDocumentNumberUniqueIndex)
    ) {
      throw error;
    }

    const conflict = await findProfessorDocumentConflict({
      academyId: input.academyId,
      professorId: input.professorId,
      documentNumber: input.documentNumber,
      scope: input.scope,
    });

    return {
      ok: false,
      conflict: conflict ?? {
        professorId: input.professorId,
        message: professorDocumentConflictMessage({
          archived: false,
          scope: input.scope,
        }),
      },
    };
  }
}

function professorDocumentConflictMessage(options: {
  archived: boolean;
  scope: RosterScope;
}) {
  const person = options.archived ? "un profesor archivado" : "un profesor";
  const academy = options.scope === "portal" ? "tu academia" : "la academia";

  return `Ya existe ${person} con ese documento en ${academy}.`;
}

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { isUniqueViolation } from "@/lib/shared/error-properties.server";
import type { RosterScope } from "@/lib/roster/roster-scope";

export type DancerEditableSnapshot = {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: string | null;
  active: boolean;
};

const dancerDocumentNumberUniqueIndex = "dancer_academy_document_number_unique";

/** Whose academy the reader is looking at: their own, or any, from the panel. */

export type DancerDocumentConflict = {
  /**
   * The dancer already holding the number, so the form can link to them.
   * Absent only when the index refused a write whose holder the follow-up
   * read could not name.
   */
  dancerId?: string;
  message: string;
};

/**
 * The number alone is the key within an academy, whatever type it was loaded
 * under, and an archived dancer still holds theirs (PRD #1090).
 */
async function findDuplicateDancerDocument(input: {
  academyId: string;
  /** Absent while creating: there is no row to exclude yet. */
  dancerId?: string;
  documentNumber: string;
}) {
  return await db.query.dancers.findFirst({
    columns: { id: true, active: true },
    where: and(
      eq(dancers.academyId, input.academyId),
      input.dancerId ? ne(dancers.id, input.dancerId) : undefined,
      eq(dancers.documentNumber, input.documentNumber),
    ),
  });
}

export async function findDancerDocumentConflict(input: {
  academyId: string;
  dancerId?: string;
  documentNumber: string;
  scope: RosterScope;
}): Promise<DancerDocumentConflict | null> {
  const duplicate = await findDuplicateDancerDocument(input);

  if (!duplicate) {
    return null;
  }

  return {
    dancerId: duplicate.id,
    message: dancerDocumentConflictMessage({
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
export async function writeDancerGuardingDocument<T>(input: {
  academyId: string;
  dancerId?: string;
  documentNumber: string | null;
  scope: RosterScope;
  write: () => Promise<T>;
}): Promise<
  { ok: true; result: T } | { ok: false; conflict: DancerDocumentConflict }
> {
  try {
    return { ok: true, result: await input.write() };
  } catch (error) {
    if (
      input.documentNumber === null ||
      !isUniqueViolation(error, dancerDocumentNumberUniqueIndex)
    ) {
      throw error;
    }

    const conflict = await findDancerDocumentConflict({
      academyId: input.academyId,
      dancerId: input.dancerId,
      documentNumber: input.documentNumber,
      scope: input.scope,
    });

    return {
      ok: false,
      conflict: conflict ?? {
        dancerId: input.dancerId,
        message: dancerDocumentConflictMessage({
          archived: false,
          scope: input.scope,
        }),
      },
    };
  }
}

function dancerDocumentConflictMessage(options: {
  archived: boolean;
  scope: RosterScope;
}) {
  const person = options.archived ? "un bailarín archivado" : "un bailarín";
  const academy = options.scope === "portal" ? "tu academia" : "la academia";

  return `Ya existe ${person} con ese documento en ${academy}.`;
}

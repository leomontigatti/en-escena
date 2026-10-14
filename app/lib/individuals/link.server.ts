import {
  and,
  eq,
  isNotNull,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

import { db } from "@/db";
import { academies, dancers, individuals, professors } from "@/db/schema";
import { academyOwner } from "@/lib/academies/owner-kind.server";
import {
  deriveIndividualLinkState,
  type IndividualLinkState,
} from "@/lib/individuals/link-state";
import type { RosterPersonKind } from "@/lib/roster/roster-person-kind.shared";
import {
  toRosterPersonStatus,
  type RosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

// The link between an individual and the academy roster rows that carry its
// document (ADR-0019). Nothing about it is stored but administration's
// confirmation: which rows it reaches is worked out on every read, so an
// academy deleting, archiving or renumbering a row is seen on the next one.
// Everything that reads "the individual's rows" goes through
// `listIndividualLinkedRosterRows`; that is the privacy boundary.

/** A `dancer` or `professor` row of an academy that a link reaches. */
export type LinkedRosterRow = {
  academyId: string;
  academyName: string;
  firstName: string;
  id: string;
  kind: RosterPersonKind;
  lastName: string;
  /** `Estado de alta`: an archived row is reached too. */
  status: RosterPersonStatus;
};

export type IndividualLinkConfirmationRefusal =
  /** The individual changed its document after administration read it. */
  | "document-changed"
  /** There is no document photo to have compared the document with. */
  | "missing-photo"
  | "not-found";

/**
 * The rows the individual reaches: the dancers and professors, in any academy
 * and whatever their `Estado de alta`, whose document number is the
 * individual's, while its link is `Vinculado`; none otherwise.
 */
export async function listIndividualLinkedRosterRows(
  individualId: string,
): Promise<LinkedRosterRow[]> {
  const individual = await findIndividualLinkFields(individualId);

  if (!individual || deriveIndividualLinkState(individual) !== "linked") {
    return [];
  }

  return await listRosterRowsCarryingDocument(individual.documentNumber);
}

/**
 * The rows the individual's document would reach, whatever its link state:
 * what administration reads before confirming the link. Nothing the individual
 * reads goes through here.
 */
export async function previewIndividualLinkRosterRows(
  individualId: string,
): Promise<LinkedRosterRow[]> {
  const individual = await findIndividualLinkFields(individualId);

  return individual
    ? await listRosterRowsCarryingDocument(individual.documentNumber)
    : [];
}

/**
 * Administration's confirmation that the document is the individual's, for
 * the number it read (`documentNumber`): when the individual changed it in
 * between, or has no photo to compare it with, nothing is written.
 */
export async function confirmIndividualLink(input: {
  confirmedByUserId: string;
  documentNumber: string;
  individualId: string;
}): Promise<
  { ok: true } | { ok: false; reason: IndividualLinkConfirmationRefusal }
> {
  const confirmed = await db
    .update(individuals)
    .set({
      linkConfirmedAt: new Date(),
      linkConfirmedByUserId: input.confirmedByUserId,
      linkConfirmedDocumentNumber: input.documentNumber,
    })
    .where(
      and(
        eq(individuals.id, input.individualId),
        eq(individuals.documentNumber, input.documentNumber),
        isNotNull(individuals.documentPhotoStorageKey),
      ),
    )
    .returning({ id: individuals.id });

  if (confirmed.length > 0) {
    return { ok: true };
  }

  const individual = await findIndividualLinkFields(input.individualId);

  if (!individual) {
    return { ok: false, reason: "not-found" };
  }

  return {
    ok: false,
    reason:
      individual.documentPhotoStorageKey === null
        ? "missing-photo"
        : "document-changed",
  };
}

/** Clears the confirmation, so the link goes back to `Pendiente`. */
export async function revokeIndividualLink(
  individualId: string,
): Promise<{ ok: boolean }> {
  const revoked = await db
    .update(individuals)
    .set({
      linkConfirmedAt: null,
      linkConfirmedByUserId: null,
      linkConfirmedDocumentNumber: null,
    })
    .where(eq(individuals.id, individualId))
    .returning({ id: individuals.id });

  return { ok: revoked.length > 0 };
}

/** `deriveIndividualLinkState` in SQL, for a list to filter on. */
export function individualLinkStateSql(): SQL<IndividualLinkState> {
  return sql<IndividualLinkState>`case
    when ${individuals.documentPhotoStorageKey} is null then 'unlinked'
    when ${individuals.linkConfirmedDocumentNumber} = ${individuals.documentNumber} then 'linked'
    else 'pending'
  end`;
}

async function findIndividualLinkFields(individualId: string) {
  return await db.query.individuals.findFirst({
    columns: {
      documentNumber: true,
      documentPhotoStorageKey: true,
      linkConfirmedDocumentNumber: true,
    },
    where: eq(individuals.id, individualId),
  });
}

/**
 * The number alone is the key, as within an academy (PRD #1090), with its
 * separators dropped on both sides: a row loaded before numbers were stored
 * normalized still matches.
 */
function sameDocumentNumber(column: SQLWrapper, documentNumber: string) {
  return sql`regexp_replace(${column}, ${documentSeparators}, '', 'g') = regexp_replace(${documentNumber}, ${documentSeparators}, '', 'g')`;
}

const documentSeparators = "[.[:space:]-]+";

async function listRosterRowsCarryingDocument(
  documentNumber: string,
): Promise<LinkedRosterRow[]> {
  const [dancerRows, professorRows] = await Promise.all([
    db
      .select({
        academyId: academies.id,
        academyName: academies.name,
        active: dancers.active,
        firstName: dancers.firstName,
        id: dancers.id,
        lastName: dancers.lastName,
      })
      .from(dancers)
      .innerJoin(academies, eq(academies.id, dancers.academyId))
      .where(
        and(
          academyOwner(),
          sameDocumentNumber(dancers.documentNumber, documentNumber),
        ),
      ),
    db
      .select({
        academyId: academies.id,
        academyName: academies.name,
        active: professors.active,
        firstName: professors.firstName,
        id: professors.id,
        lastName: professors.lastName,
      })
      .from(professors)
      .innerJoin(academies, eq(academies.id, professors.academyId))
      .where(
        and(
          academyOwner(),
          sameDocumentNumber(professors.documentNumber, documentNumber),
        ),
      ),
  ]);

  return [
    ...dancerRows.map((row) => toLinkedRosterRow(row, "dancer")),
    ...professorRows.map((row) => toLinkedRosterRow(row, "professor")),
  ].sort(compareLinkedRosterRows);
}

function toLinkedRosterRow(
  {
    active,
    ...row
  }: Omit<LinkedRosterRow, "kind" | "status"> & {
    active: boolean;
  },
  kind: RosterPersonKind,
): LinkedRosterRow {
  return { ...row, kind, status: toRosterPersonStatus(active) };
}

const kindOrder = { dancer: 0, professor: 1 } as const;

/** By academy, then dancers before professors, then by name. */
function compareLinkedRosterRows(a: LinkedRosterRow, b: LinkedRosterRow) {
  return (
    a.academyName.localeCompare(b.academyName, "es") ||
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.lastName.localeCompare(b.lastName, "es") ||
    a.firstName.localeCompare(b.firstName, "es") ||
    a.id.localeCompare(b.id)
  );
}

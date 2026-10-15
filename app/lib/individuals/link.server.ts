import { and, eq, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import { academies, dancers, individuals, professors } from "@/db/schema";
import { academyOwner } from "@/lib/academies/owner-kind.server";
import {
  deriveIndividualLinkState,
  type IndividualLinkState,
} from "@/lib/individuals/link-state";
import { rosterPersonTable } from "@/lib/roster/roster-person-kind.server";
import {
  rosterPersonKinds,
  type RosterPersonKind,
} from "@/lib/roster/roster-person-kind.shared";
import {
  toRosterPersonStatus,
  type RosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

// The link between an individual and the academy roster rows that carry its
// document (ADR-0019). Nothing about it is stored but administration's
// confirmation: which rows it reaches is worked out on every read, so an
// academy deleting, archiving or renumbering a row is seen on the next one.
// Everything that reads "the individual's rows", or "the individuals reaching
// a row", goes through the reads of this module; that is the privacy boundary.

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
  | "not-found"
  /** The individual replaced its photo after administration read it. */
  | "photo-changed";

/** What the link's state is derived from, as a caller may have loaded it. */
type IndividualLinkFields = {
  documentNumber: string;
  documentPhotoStorageKey: string | null;
  linkConfirmedDocumentNumber: string | null;
};

/** An individual's id, or the link fields its caller already read. */
type IndividualLinkSubject = string | IndividualLinkFields;

/**
 * The rows the individual reaches: the dancers and professors, in any academy
 * and whatever their `Estado de alta`, whose document number is the
 * individual's, while its link is `Vinculado`; none otherwise.
 */
export async function listIndividualLinkedRosterRows(
  subject: IndividualLinkSubject,
): Promise<LinkedRosterRow[]> {
  const individual = await resolveIndividualLinkFields(subject);

  if (!individual || deriveIndividualLinkState(individual) !== "linked") {
    return [];
  }

  return await listRosterRowsCarryingDocument(individual.documentNumber);
}

/**
 * Administration's confirmation that the document is the individual's, for
 * the number and the photo it compared (`documentNumber`,
 * `documentPhotoStorageKey`): when the individual changed either in between,
 * or has no photo, nothing is written.
 */
export async function confirmIndividualLink(input: {
  confirmedByUserId: string;
  documentNumber: string;
  documentPhotoStorageKey: string;
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
        eq(individuals.documentPhotoStorageKey, input.documentPhotoStorageKey),
      ),
    )
    .returning({ id: individuals.id });

  if (confirmed.length > 0) {
    return { ok: true };
  }

  const individual = await findIndividualLinkFields(input.individualId);

  return {
    ok: false,
    reason: describeConfirmationRefusal(individual, input),
  };
}

function describeConfirmationRefusal(
  individual: IndividualLinkFields | undefined,
  read: { documentNumber: string },
): IndividualLinkConfirmationRefusal {
  if (!individual) {
    return "not-found";
  }

  if (individual.documentPhotoStorageKey === null) {
    return "missing-photo";
  }

  return individual.documentNumber === read.documentNumber
    ? "photo-changed"
    : "document-changed";
}

/** Clears the confirmation, so the link goes back to `Pendiente`. */
export async function revokeIndividualLink(
  individualId: string,
): Promise<{ ok: true } | { ok: false; reason: "not-found" }> {
  const revoked = await db
    .update(individuals)
    .set({
      linkConfirmedAt: null,
      linkConfirmedByUserId: null,
      linkConfirmedDocumentNumber: null,
    })
    .where(eq(individuals.id, individualId))
    .returning({ id: individuals.id });

  return revoked.length > 0 ? { ok: true } : { ok: false, reason: "not-found" };
}

/** One reach of a `Vinculado` link: an individual and a row carrying its
 * document. `ownerAcademyId` is the individual's owner row. */
export type IndividualRosterRowLink = {
  individualId: string;
  ownerAcademyId: string;
  rosterRowId: string;
  rosterRowKind: RosterPersonKind;
};

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The rows each of these individuals' links reaches, as
 * `listIndividualLinkedRosterRows` reaches them, read at once. */
export async function listIndividualsLinkedRosterRows(
  individualIds: readonly string[],
  executor: Executor = db,
): Promise<IndividualRosterRowLink[]> {
  if (individualIds.length === 0) {
    return [];
  }

  return await listLinks(executor, () =>
    inArray(individuals.id, [...new Set(individualIds)]),
  );
}

/**
 * The individuals whose `Vinculado` link reaches each of these rows: the
 * reverse of `listIndividualLinkedRosterRows`, by the same document rule and
 * the same link state, one pair per row and individual. A row carrying no
 * number, or whose academy is not of kind `academy`, reaches no one.
 * `executor` lets a write read it under its own transaction.
 */
export async function listRosterRowsLinkedIndividuals(
  rows: readonly { id: string; kind: RosterPersonKind }[],
  executor: Executor = db,
): Promise<IndividualRosterRowLink[]> {
  if (rows.length === 0) {
    return [];
  }

  return await listLinks(executor, (kind) => {
    const ids = rows.filter((row) => row.kind === kind).map((row) => row.id);

    return ids.length === 0
      ? undefined
      : inArray(rosterPersonTable(kind).id, ids);
  });
}

/**
 * The links in SQL, by the same rules as `listRosterRowsCarryingDocument`
 * (`sameDocumentNumberAs`), rows of academies only, while the link state is
 * `linked`. `narrow` returns no condition for a kind it does not ask about,
 * which skips that kind.
 */
async function listLinks(
  executor: Executor,
  narrow: (kind: RosterPersonKind) => SQL | undefined,
): Promise<IndividualRosterRowLink[]> {
  const reads = rosterPersonKinds.map(async (kind) => {
    const condition = narrow(kind);

    if (!condition) {
      return [];
    }

    const table = rosterPersonTable(kind);
    const rows = await executor
      .select({
        individualId: individuals.id,
        ownerAcademyId: individuals.academyId,
        rosterRowId: table.id,
      })
      .from(individuals)
      .innerJoin(table, sameDocumentNumberAs(table.documentNumber))
      .innerJoin(academies, eq(academies.id, table.academyId))
      .where(
        and(academyOwner(), eq(individualLinkStateSql(), "linked"), condition),
      );

    return rows.map((row) => ({ ...row, rosterRowKind: kind }));
  });

  return (await Promise.all(reads)).flat();
}

/** `deriveIndividualLinkState` in SQL, for a list to filter on. */
export function individualLinkStateSql(): SQL<IndividualLinkState> {
  return sql<IndividualLinkState>`case
    when ${individuals.documentPhotoStorageKey} is null then 'unlinked'
    when ${individuals.linkConfirmedDocumentNumber} = ${individuals.documentNumber} then 'linked'
    else 'pending'
  end`;
}

async function resolveIndividualLinkFields(subject: IndividualLinkSubject) {
  return typeof subject === "string"
    ? await findIndividualLinkFields(subject)
    : subject;
}

async function findIndividualLinkFields(
  individualId: string,
): Promise<IndividualLinkFields | undefined> {
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
 * normalized still matches. `digits` is never empty, so a row whose number is
 * only separators matches nothing.
 */
function sameDocumentNumber(column: SQLWrapper, digits: string) {
  return sql`regexp_replace(${column}, ${documentSeparatorsPattern}, '', 'g') = ${digits}`;
}

/**
 * `sameDocumentNumber` against the individual's own number, for a join: the
 * individual's digits must not be empty, as there.
 */
function sameDocumentNumberAs(column: SQLWrapper) {
  const individualDigits = sql`regexp_replace(${individuals.documentNumber}, ${documentSeparatorsPattern}, '', 'g')`;

  return sql`(${individualDigits} <> '' and regexp_replace(${column}, ${documentSeparatorsPattern}, '', 'g') = ${individualDigits})`;
}

/** The same separators in SQL and in TypeScript. */
const documentSeparatorsPattern = "[.[:space:]-]+";
const documentSeparators = /[.\s-]+/g;

async function listRosterRowsCarryingDocument(
  documentNumber: string,
): Promise<LinkedRosterRow[]> {
  const digits = documentNumber.replace(documentSeparators, "");

  // Separators alone are no number: they would match every row loaded so.
  if (digits === "") {
    return [];
  }

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
        and(academyOwner(), sameDocumentNumber(dancers.documentNumber, digits)),
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
          sameDocumentNumber(professors.documentNumber, digits),
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

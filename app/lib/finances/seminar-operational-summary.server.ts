import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminars } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import {
  type OperationalFinanceRollup,
  rollUpInscriptionFinanceFigures,
} from "@/lib/finances/operational-summary-calculations.server";
import {
  type ResolvedSeminarInscription,
  resolveSeminarInscriptions,
  type SeminarInscriptionFinanceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";
import {
  seminarInscriptionOwnedBy,
  seminarInscriptionPerson,
} from "@/lib/seminars/inscription-person.server";

/**
 * One `(seminar, academy)` unit: the money an academy owes and paid for one
 * seminar, plus what names the seminar to both sides. It is the seminar's
 * counterpart of `ChoreographyOperationalFinanceRow`, and the unit is the pair
 * rather than the seminar alone because a seminar is shared by every academy
 * while a debt belongs to one.
 *
 * `registrationCount` — the shared rollup's figure — is the academy's **active**
 * inscriptions in the seminar; the `Inscriptos` column of the tab adds its
 * linked individuals' (`withLinkedInscriptionsCounted`). It is not the
 * seminar's occupancy: places are taken by covering the deposit, not by
 * registering.
 */
export type SeminarOperationalFinanceRow = OperationalFinanceRollup & {
  academyId: string;
  id: string;
  instructorName: string;
  scheduledDate: string;
};

type SeminarUnitRow = SeminarInscriptionFinanceRow & {
  academyId: string;
  instructorName: string;
  scheduledDate: string;
};

/** The key a `(seminar, academy)` unit is grouped and looked up by. */
function seminarUnitKey(input: {
  academyId: string;
  seminarId: string;
}): string {
  return `${input.seminarId}:${input.academyId}`;
}

/**
 * Every `(seminar, academy)` unit of the named academies in one event, with its
 * inscriptions already resolved. The academy of an inscription is read through
 * the person, as it is everywhere else on this side, which is why both roster
 * tables are joined and whichever half is filled answers.
 *
 * Withdrawn rows are read and not filtered: they belong in the money rollup —
 * their retained allocation is still this academy's money in this seminar — and
 * `rollUpInscriptionFinanceFigures` is what keeps them out of the status and out
 * of the count.
 */
export async function readAcademySeminarFinance(input: {
  academyIds: string[];
  eventId: string;
  // The executor, so a caller reading inside a transaction stays inside it.
  executor?: Executor;
}): Promise<{
  rowsByAcademy: Map<string, SeminarOperationalFinanceRow[]>;
  // The inscriptions the rows roll up, per academy: what a unit's delta is
  // measured on, read once rather than unit by unit.
  inscriptionsByAcademy: Map<string, ResolvedSeminarInscription[]>;
}> {
  const executor = input.executor ?? db;
  const rowsByAcademy = new Map<string, SeminarOperationalFinanceRow[]>();
  const inscriptionsByAcademy = new Map<string, ResolvedSeminarInscription[]>();

  for (const academyId of input.academyIds) {
    rowsByAcademy.set(academyId, []);
    inscriptionsByAcademy.set(academyId, []);
  }

  const unitRows = await readSeminarUnitRows({ ...input, executor });
  const resolutions = await resolveSeminarInscriptions(executor, {
    eventId: input.eventId,
    rows: unitRows,
  });

  const inscriptionsByUnit = new Map<string, ResolvedSeminarInscription[]>();
  const unitFactsByKey = new Map<string, SeminarUnitRow>();

  for (const row of unitRows) {
    const resolution = resolutions.get(row.id);

    if (!resolution) {
      continue;
    }

    const key = seminarUnitKey(row);
    unitFactsByKey.set(key, row);
    inscriptionsByAcademy.get(row.academyId)?.push(resolution);
    const bucket = inscriptionsByUnit.get(key);

    if (bucket) {
      bucket.push(resolution);
    } else {
      inscriptionsByUnit.set(key, [resolution]);
    }
  }

  for (const [key, facts] of unitFactsByKey) {
    rowsByAcademy
      .get(facts.academyId)
      ?.push(
        buildSeminarOperationalFinanceRow(
          facts,
          inscriptionsByUnit.get(key) ?? [],
        ),
      );
  }

  for (const rows of rowsByAcademy.values()) {
    rows.sort(bySeminarSlot);
  }

  return { rowsByAcademy, inscriptionsByAcademy };
}

/**
 * One `(seminar, academy)` unit's status and its inscriptions, withdrawn ones
 * included: the unit `readAcademySeminarFinance` rolls up, at the grain an
 * emission bills by. A unit with no inscription reads like the empty rollup.
 */
export async function readSeminarUnitFinance(input: {
  academyId: string;
  eventId: string;
  seminarId: string;
  executor?: Executor;
}): Promise<{
  financialStatus: SeminarOperationalFinanceRow["financialStatus"];
  inscriptions: ResolvedSeminarInscription[];
}> {
  const executor = input.executor ?? db;
  const unitRows = (
    await readSeminarUnitRows({
      academyIds: [input.academyId],
      eventId: input.eventId,
      executor,
    })
  ).filter((row) => row.seminarId === input.seminarId);
  const resolutions = await resolveSeminarInscriptions(executor, {
    eventId: input.eventId,
    rows: unitRows,
  });
  const inscriptions = unitRows.flatMap((row) => {
    const resolution = resolutions.get(row.id);

    return resolution ? [resolution] : [];
  });

  return {
    financialStatus: rollUpInscriptionFinanceFigures(
      inscriptions.map((inscription) => ({
        ...inscription,
        basePriceAmount: inscription.priceRow?.amount ?? null,
      })),
    ).financialStatus,
    inscriptions,
  };
}

function buildSeminarOperationalFinanceRow(
  facts: SeminarUnitRow,
  inscriptions: ResolvedSeminarInscription[],
): SeminarOperationalFinanceRow {
  return {
    ...rollUpInscriptionFinanceFigures(
      inscriptions.map((inscription) => ({
        ...inscription,
        basePriceAmount: inscription.priceRow?.amount ?? null,
      })),
    ),
    academyId: facts.academyId,
    id: facts.seminarId,
    instructorName: facts.instructorName,
    scheduledDate: facts.scheduledDate,
  };
}

async function readSeminarUnitRows(input: {
  academyIds: string[];
  eventId: string;
  executor?: Executor;
}): Promise<SeminarUnitRow[]> {
  if (input.academyIds.length === 0) {
    return [];
  }

  return (input.executor ?? db)
    .select({
      academyId: seminarInscriptionPerson.academyId,
      dancerId: seminarInscriptions.dancerId,
      id: seminarInscriptions.id,
      instructorName: seminars.instructorName,
      individualId: seminarInscriptions.individualId,
      professorId: seminarInscriptions.professorId,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      scheduledDate: seminars.scheduledDate,
      seminarId: seminarInscriptions.seminarId,
      seminarKind: seminars.kind,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .where(
      and(
        eq(seminars.eventId, input.eventId),
        seminarInscriptionOwnedBy(input.academyIds),
      ),
    );
}

/**
 * A seminar the academy registered nobody in but a linked individual is in
 * (ADR-0019), as the academy's finances list it: every figure zero, since the
 * individual's inscription owes the academy nothing, and `registrationCount`
 * zero, since it counts the academy's own; the loaders add the linked
 * inscriptions to it afterwards (`withLinkedInscriptionsCounted`). Built by the portal loaders beside
 * this read's rows, never inside it, so no total, `Saldo disponible` or preset
 * can count it.
 */
export function linkedIndividualsOnlySeminarFinanceRow(facts: {
  academyId: string;
  id: string;
  instructorName: string;
  scheduledDate: string;
}): SeminarOperationalFinanceRow {
  return { ...rollUpInscriptionFinanceFigures([]), ...facts };
}

/**
 * The rows with `registrationCount` raised by the linked individuals'
 * inscriptions in each seminar (ADR-0019): `Inscriptos` counts the people the
 * academy's seminar lists, on both sides, though they owe it nothing. Applied
 * by the loaders after every figure was derived, like the zero row above.
 */
export function withLinkedInscriptionsCounted<
  TRow extends Pick<SeminarOperationalFinanceRow, "id" | "registrationCount">,
>(
  rows: readonly TRow[],
  linkedInscriptions: readonly { seminarId: string }[],
): TRow[] {
  const linkedCounts = new Map<string, number>();

  for (const inscription of linkedInscriptions) {
    linkedCounts.set(
      inscription.seminarId,
      (linkedCounts.get(inscription.seminarId) ?? 0) + 1,
    );
  }

  return rows.map((row) => ({
    ...row,
    registrationCount: row.registrationCount + (linkedCounts.get(row.id) ?? 0),
  }));
}

/** The order the tab opens in: the seminar's moment, then its instructor. */
export function bySeminarSlot(
  first: Pick<SeminarOperationalFinanceRow, "instructorName" | "scheduledDate">,
  second: Pick<
    SeminarOperationalFinanceRow,
    "instructorName" | "scheduledDate"
  >,
) {
  return (
    first.scheduledDate.localeCompare(second.scheduledDate) ||
    first.instructorName.localeCompare(second.instructorName, "es-AR")
  );
}

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  dancers,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import {
  type OperationalFinanceRollup,
  rollUpInscriptionFinanceFigures,
} from "@/lib/finances/operational-summary-calculations.server";
import {
  type ResolvedSeminarInscription,
  resolveSeminarInscriptions,
  type SeminarInscriptionFinanceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";

/**
 * One `(seminar, academy)` unit: the money an academy owes and paid for one
 * seminar, plus what names the seminar to both sides. It is the seminar's
 * counterpart of `ChoreographyOperationalFinanceRow`, and the unit is the pair
 * rather than the seminar alone because a seminar is shared by every academy
 * while a debt belongs to one.
 *
 * `registrationCount` — the shared rollup's figure — is the academy's **active**
 * inscriptions in the seminar, the `Inscriptos` column of the tab. It is not the
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
}): Promise<Map<string, SeminarOperationalFinanceRow[]>> {
  const rowsByAcademy = new Map<string, SeminarOperationalFinanceRow[]>();

  for (const academyId of input.academyIds) {
    rowsByAcademy.set(academyId, []);
  }

  const unitRows = await readSeminarUnitRows(input);
  const resolutions = await resolveSeminarInscriptions(db, {
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

  return rowsByAcademy;
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
}): Promise<SeminarUnitRow[]> {
  if (input.academyIds.length === 0) {
    return [];
  }

  const academyId = sql<string>`coalesce(${dancers.academyId}, ${professors.academyId})`;

  return db
    .select({
      academyId,
      dancerId: seminarInscriptions.dancerId,
      id: seminarInscriptions.id,
      instructorName: seminars.instructorName,
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
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .where(
      and(
        eq(seminars.eventId, input.eventId),
        inArray(academyId, input.academyIds),
      ),
    );
}

/** The order the tab opens in: the seminar's moment, then its instructor. */
function bySeminarSlot(
  first: SeminarOperationalFinanceRow,
  second: SeminarOperationalFinanceRow,
) {
  return (
    first.scheduledDate.localeCompare(second.scheduledDate) ||
    first.instructorName.localeCompare(second.instructorName, "es-AR")
  );
}

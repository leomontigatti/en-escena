import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  dancers,
  professors,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import {
  workbookResponse,
  workbookSheet,
} from "@/features/admin/day-export/server";
import { sumKnown } from "@/features/admin/day-export/sheet";
import { readPeriodExport } from "@/features/admin/period-export/server";
import { resolveSeminarInscriptions } from "@/lib/finances/seminar-inscription-thresholds.server";
import { listSeminars } from "@/lib/seminars/repository.server";

import {
  buildSeminarsExportFileName,
  exportAllSeminars,
  exportSeminarParam,
  seminarExportLabels,
  seminarSheetNames,
} from "./shared";
import {
  seminarInscriptionColumns,
  type SeminarInscriptionFigures,
  type SeminarInscriptionSheetRow,
} from "./sheet";

/**
 * The seminars of the event that hold at least one inscription, active or
 * withdrawn: the ones the export has a sheet for, and so the ones its dialog
 * offers.
 */
export async function listExportableSeminarIds(
  eventId: string,
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ seminarId: seminarInscriptions.seminarId })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .where(eq(seminars.eventId, eventId));

  return new Set(rows.map(({ seminarId }) => seminarId));
}

/**
 * Every inscription of the selected event's seminars, or of one of them, with
 * its money as it stands today, for the auditor: one sheet per seminar, in the
 * list's order, and none for a seminar nobody registered in. Withdrawn
 * inscriptions are in, since what stays allocated to them is money of the
 * event. A seminar that is not the event's, or has nothing to export, is not
 * found.
 */
export async function loadSeminarsExport(request: Request): Promise<Response> {
  const { eventId, eventName } = await readPeriodExport(request);
  const chosen =
    new URL(request.url).searchParams.get(exportSeminarParam) ??
    exportAllSeminars;
  const exportable = await listExportableSeminarIds(eventId);
  const eventSeminars = (await listSeminars(eventId)).filter(({ id }) =>
    exportable.has(id),
  );
  // Named against every seminar the dialog offers, so one seminar's sheet and
  // file are named as it is in the dialog and in the whole workbook.
  const sheetNames = seminarSheetNames(eventSeminars);
  const exported =
    chosen === exportAllSeminars
      ? eventSeminars
      : eventSeminars.filter(({ id }) => id === chosen);

  if (exported.length === 0) {
    throw new Response("Seminario no encontrado", { status: 404 });
  }

  const rowsBySeminar = await readSeminarSheetRows(eventId);

  return await workbookResponse({
    fileName: buildSeminarsExportFileName(
      eventName,
      chosen === exportAllSeminars
        ? null
        : (seminarExportLabels(eventSeminars).get(exported[0].id) ?? null),
    ),
    sheets: exported.map((seminar) => {
      const rows = rowsBySeminar.get(seminar.id) ?? [];

      return workbookSheet({
        columns: seminarInscriptionColumns,
        rows: [
          ...rows.map(({ seminarId: _, ...row }) => row),
          { ...totalFigures(rows), kind: "total" },
        ] satisfies SeminarInscriptionSheetRow[],
        sheet: sheetNames.get(seminar.id) ?? seminar.instructorName,
      });
    }),
  });
}

type InscriptionRow = Extract<
  SeminarInscriptionSheetRow,
  { kind: "inscription" }
> & { seminarId: string };

/**
 * The event's seminar inscriptions with their figures, by seminar, each
 * seminar's sorted by academy and then by full name. The figures come from
 * the one seminar money derivation, so the export cannot quote a price the
 * finance screens do not.
 */
async function readSeminarSheetRows(
  eventId: string,
): Promise<Map<string, InscriptionRow[]>> {
  const people = await db
    .select({
      academyName: academies.name,
      dancerId: seminarInscriptions.dancerId,
      firstName: sql<string>`coalesce(${dancers.firstName}, ${professors.firstName})`,
      id: seminarInscriptions.id,
      instructorName: seminars.instructorName,
      lastName: sql<string>`coalesce(${dancers.lastName}, ${professors.lastName})`,
      professorId: seminarInscriptions.professorId,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      seminarId: seminarInscriptions.seminarId,
      seminarKind: seminars.kind,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .innerJoin(
      academies,
      eq(
        academies.id,
        sql`coalesce(${dancers.academyId}, ${professors.academyId})`,
      ),
    )
    .where(eq(seminars.eventId, eventId));
  const resolutions = await resolveSeminarInscriptions(db, {
    eventId,
    rows: people,
  });
  const rowsBySeminar = new Map<string, InscriptionRow[]>();

  for (const person of people) {
    const figures = resolutions.get(person.id);

    if (!figures) {
      continue;
    }

    rowsBySeminar.set(person.seminarId, [
      ...(rowsBySeminar.get(person.seminarId) ?? []),
      {
        academyName: person.academyName,
        allocatedAmount: figures.allocatedAmount,
        depositAmount: figures.depositAmount,
        depositPaidAmount:
          figures.depositAmount === null
            ? null
            : Math.min(figures.allocatedAmount, figures.depositAmount),
        fullName: `${person.firstName} ${person.lastName}`,
        instructorName: person.instructorName,
        kind: "inscription",
        owedBalanceAmount: figures.owedBalanceAmount,
        personKind: person.professorId === null ? "dancer" : "professor",
        seminarId: person.seminarId,
        totalAmount: figures.totalAmount,
        withdrawn: figures.withdrawn,
      },
    ]);
  }

  for (const rows of rowsBySeminar.values()) {
    rows.sort(
      (first, second) =>
        first.academyName.localeCompare(second.academyName, "es-AR") ||
        first.fullName.localeCompare(second.fullName, "es-AR"),
    );
  }

  return rowsBySeminar;
}

/** An amount is unknown as soon as one inscription has no price to derive it from. */
function totalFigures(
  rows: readonly SeminarInscriptionFigures[],
): SeminarInscriptionFigures {
  return {
    allocatedAmount: sumKnown(rows.map((row) => row.allocatedAmount)) ?? 0,
    depositAmount: sumKnown(rows.map((row) => row.depositAmount)),
    depositPaidAmount: sumKnown(rows.map((row) => row.depositPaidAmount)),
    owedBalanceAmount: sumKnown(rows.map((row) => row.owedBalanceAmount)),
    totalAmount: sumKnown(rows.map((row) => row.totalAmount)),
  };
}

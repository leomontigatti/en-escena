import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  modalities,
} from "@/db/schema";
import {
  workbookResponse,
  workbookSheet,
} from "@/features/admin/day-export/server";
import {
  inscriptionOfAnyStateRegisteredInPeriod,
  readPeriodExport,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";
import {
  formatProvinceLabel,
  noProvinceLabel,
  provinceOptions,
  type Province,
} from "@/lib/academies/provinces";

import { readEventChoreographyInscriptionFinances } from "@/lib/finances/operational-summary.server";
import type { ResolvedInscription } from "@/lib/finances/operational-summary-calculations.server";

import {
  choreographyFinanceColumns,
  participationCountColumns,
  type ChoreographyFinanceFigures,
  type ChoreographyFinanceRow,
  type ParticipationCountRow,
} from "./sheet";

type CountedInscription = {
  academyId: string;
  dancerId: string;
  modalityName: string;
  province: Province | null;
};

/** An inscription registered in the period, active or withdrawn, with its money. */
type PeriodInscription = CountedInscription & {
  academyName: string;
  choreographyId: string;
  choreographyName: string;
  choreographyNumber: number;
  figures: ResolvedInscription;
};

/**
 * How many academies, dancers and inscriptions the selected event had in the
 * period, by the academy's province and by the choreography's modality, for
 * the auditor. It counts active choreography inscriptions registered in the
 * period; seminar inscriptions have no modality and are left out. A total row
 * closes each sheet, counting each academy and dancer once.
 *
 * `Por coreografía` lists the same inscriptions by choreography with their
 * money as it stands today, and adds the withdrawn ones registered in the
 * period: what stays allocated to them is money of the event, so leaving them
 * out would leave `Pagado` short of what `Recaudación` allocates.
 */
export async function loadParticipationCountsExport(
  request: Request,
): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  const figuresById = new Map(
    (await readEventChoreographyInscriptionFinances(eventId)).map(
      (figures) => [figures.id, figures] as const,
    ),
  );
  // One read of the inscriptions, so the three sheets and their totals count
  // the same set even while inscriptions change. The money was read first, and
  // whether an inscription is withdrawn is read with it: one registered
  // between the two reads has no figures yet and is left out of every sheet
  // alike, and one withdrawn between them still reads as it did with its
  // money, never as a withdrawn row that owes.
  const registered = await db
    .select({
      academyId: choreographies.academyId,
      academyName: academies.name,
      choreographyId: choreographies.id,
      choreographyName: choreographies.name,
      choreographyNumber: choreographies.choreographyNumber,
      dancerId: choreographyDancers.dancerId,
      id: choreographyDancers.id,
      modalityName: modalities.name,
      province: academies.province,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .innerJoin(academies, eq(academies.id, choreographies.academyId))
    .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
    .where(inscriptionOfAnyStateRegisteredInPeriod(eventId, period))
    .orderBy(asc(modalities.name));
  const periodInscriptions = registered.flatMap(
    ({ id, ...inscription }): PeriodInscription[] => {
      const figures = figuresById.get(id);

      return figures ? [{ ...inscription, figures }] : [];
    },
  );
  const inscriptions: CountedInscription[] = periodInscriptions.filter(
    ({ figures }) => !figures.withdrawn,
  );
  const totalRow: ParticipationCountRow = {
    ...countOf(inscriptions),
    isTotal: true,
    label: "Total",
  };
  const provinceOrder = [...provinceOptions.map(({ value }) => value), null];

  return await workbookResponse({
    fileName: buildPeriodExportFileName("participacion", eventName, period),
    sheets: [
      workbookSheet({
        columns: choreographyFinanceColumns,
        rows: [
          ...groupRows(
            periodInscriptions,
            (inscription) => inscription.choreographyId,
          )
            .sort(
              ([, [left]], [, [right]]) =>
                left.choreographyNumber - right.choreographyNumber,
            )
            .map(([, rows]): ChoreographyFinanceRow => ({
              ...financeFiguresOf(rows),
              academyName: rows[0].academyName,
              kind: "choreography",
              modalityName: rows[0].modalityName,
              name: rows[0].choreographyName,
              number: rows[0].choreographyNumber,
            })),
          { ...financeFiguresOf(periodInscriptions), kind: "total" },
        ],
        sheet: "Por coreografía",
      }),
      workbookSheet({
        columns: participationCountColumns("Provincia"),
        rows: [
          ...groupRows(inscriptions, (inscription) => inscription.province)
            .sort(
              ([left], [right]) =>
                provinceOrder.indexOf(left) - provinceOrder.indexOf(right),
            )
            .map(([province, rows]) => ({
              ...countOf(rows),
              isTotal: false,
              label: formatProvinceLabel(province) ?? noProvinceLabel,
            })),
          totalRow,
        ],
        sheet: "Por provincia",
      }),
      workbookSheet({
        columns: participationCountColumns("Modalidad"),
        rows: [
          ...groupRows(
            inscriptions,
            (inscription) => inscription.modalityName,
          ).map(([modalityName, rows]) => ({
            ...countOf(rows),
            isTotal: false,
            label: modalityName,
          })),
          totalRow,
        ],
        sheet: "Por modalidad",
      }),
    ],
  });
}

/** The inscriptions by a key, in the order each key first appears. */
function groupRows<Key, Inscription>(
  inscriptions: readonly Inscription[],
  keyOf: (inscription: Inscription) => Key,
): [Key, Inscription[]][] {
  const groups = new Map<Key, Inscription[]>();

  for (const inscription of inscriptions) {
    const key = keyOf(inscription);

    groups.set(key, [...(groups.get(key) ?? []), inscription]);
  }

  return [...groups];
}

/**
 * The counts and the money of a set of inscriptions. An amount is unknown as
 * soon as one inscription has no price to derive it from; what is allocated
 * never is.
 */
function financeFiguresOf(
  inscriptions: readonly PeriodInscription[],
): ChoreographyFinanceFigures {
  const figures = inscriptions.map((inscription) => inscription.figures);
  const active = figures.filter((row) => !row.withdrawn);

  return {
    allocatedAmount: sumKnown(figures.map((row) => row.allocatedAmount)) ?? 0,
    dancerDiscountAmount: sumKnown(
      figures.map((row) =>
        row.basePriceAmount === null ? null : row.dancerDiscountAmount,
      ),
    ),
    depositAmount: sumKnown(figures.map((row) => row.depositAmount)),
    depositPaidAmount: sumKnown(
      figures.map((row) =>
        row.depositAmount === null
          ? null
          : Math.min(row.allocatedAmount, row.depositAmount),
      ),
    ),
    inscriptions: active.length,
    owedBalanceAmount: sumKnown(figures.map((row) => row.owedBalanceAmount)),
    totalAmount: sumKnown(figures.map((row) => row.totalAmount)),
    withdrawnInscriptions: inscriptions.length - active.length,
  };
}

function sumKnown(amounts: readonly (number | null)[]): number | null {
  return amounts.reduce<number | null>(
    (total, amount) =>
      total === null || amount === null ? null : total + amount,
    0,
  );
}

/** Academies and dancers are distinct counts; every inscription counts. */
function countOf(inscriptions: readonly CountedInscription[]) {
  return {
    academies: new Set(inscriptions.map(({ academyId }) => academyId)).size,
    dancers: new Set(inscriptions.map(({ dancerId }) => dancerId)).size,
    inscriptions: inscriptions.length,
  };
}

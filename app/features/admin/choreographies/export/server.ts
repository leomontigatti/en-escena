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
  inscriptionRegisteredInPeriod,
  readPeriodExport,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";
import {
  formatProvinceLabel,
  noProvinceLabel,
  provinceOptions,
  type Province,
} from "@/lib/academies/provinces";

import { participationCountColumns, type ParticipationCountRow } from "./sheet";

type CountedInscription = {
  academyId: string;
  dancerId: string;
  modalityName: string;
  province: Province | null;
};

/**
 * How many academies, dancers and inscriptions the selected event had in the
 * period, by the academy's province and by the choreography's modality, for
 * the auditor. It counts active choreography inscriptions registered in the
 * period; seminar inscriptions have no modality and are left out. A total row
 * closes each sheet, counting each academy and dancer once.
 */
export async function loadParticipationCountsExport(
  request: Request,
): Promise<Response> {
  const { eventId, eventName, period } = await readPeriodExport(request);
  // One read of the inscriptions, so both sheets and their totals count the
  // same set even while inscriptions change.
  const inscriptions: CountedInscription[] = await db
    .select({
      academyId: choreographies.academyId,
      dancerId: choreographyDancers.dancerId,
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
    .where(inscriptionRegisteredInPeriod(eventId, period))
    .orderBy(asc(modalities.name));
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
function groupRows<Key>(
  inscriptions: readonly CountedInscription[],
  keyOf: (inscription: CountedInscription) => Key,
): [Key, CountedInscription[]][] {
  const groups = new Map<Key, CountedInscription[]>();

  for (const inscription of inscriptions) {
    const key = keyOf(inscription);

    groups.set(key, [...(groups.get(key) ?? []), inscription]);
  }

  return [...groups];
}

/** Academies and dancers are distinct counts; every inscription counts. */
function countOf(inscriptions: readonly CountedInscription[]) {
  return {
    academies: new Set(inscriptions.map(({ academyId }) => academyId)).size,
    dancers: new Set(inscriptions.map(({ dancerId }) => dancerId)).size,
    inscriptions: inscriptions.length,
  };
}

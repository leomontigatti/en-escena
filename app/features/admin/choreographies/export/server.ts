import { and, asc, countDistinct, count, eq, type SQL } from "drizzle-orm";

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
  readPeriodExport,
  timestampInPeriod,
} from "@/features/admin/period-export/server";
import { buildPeriodExportFileName } from "@/features/admin/period-export/shared";
import {
  formatProvinceLabel,
  noProvinceLabel,
  provinceOptions,
} from "@/lib/academies/provinces";
import { activeInscription } from "@/lib/choreographies/active-inscription";

import { participationCountColumns, type ParticipationCountRow } from "./sheet";

const countSelection = {
  academies: countDistinct(choreographies.academyId),
  dancers: countDistinct(choreographyDancers.dancerId),
  inscriptions: count(choreographyDancers.id),
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
  const counted = and(
    eq(choreographies.eventId, eventId),
    activeInscription(),
    timestampInPeriod(choreographyDancers.createdAt, period),
  );
  const [byProvince, byModality, [total]] = await Promise.all([
    db
      .select({ ...countSelection, province: academies.province })
      .from(choreographyDancers)
      .innerJoin(
        choreographies,
        eq(choreographies.id, choreographyDancers.choreographyId),
      )
      .innerJoin(academies, eq(academies.id, choreographies.academyId))
      .where(counted)
      .groupBy(academies.province),
    db
      .select({ ...countSelection, modalityName: modalities.name })
      .from(choreographyDancers)
      .innerJoin(
        choreographies,
        eq(choreographies.id, choreographyDancers.choreographyId),
      )
      .innerJoin(modalities, eq(modalities.id, choreographies.modalityId))
      .where(counted)
      .groupBy(modalities.id, modalities.name)
      .orderBy(asc(modalities.name)),
    countTotal(counted),
  ]);
  const provinceOrder = (province: string | null) =>
    province === null
      ? provinceOptions.length
      : provinceOptions.findIndex((option) => option.value === province);
  const totalRow: ParticipationCountRow = {
    ...total,
    isTotal: true,
    label: "Total",
  };

  return await workbookResponse({
    fileName: buildPeriodExportFileName("participacion", eventName, period),
    sheets: [
      workbookSheet({
        columns: participationCountColumns("Provincia"),
        rows: [
          ...[...byProvince]
            .sort(
              (left, right) =>
                provinceOrder(left.province) - provinceOrder(right.province),
            )
            .map(({ province, ...counts }) => ({
              ...counts,
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
          ...byModality.map(({ modalityName, ...counts }) => ({
            ...counts,
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

async function countTotal(counted: SQL | undefined) {
  return await db
    .select(countSelection)
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(counted);
}

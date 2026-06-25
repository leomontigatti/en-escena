import { asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies, dancers } from "@/db/schema";
import {
  adminDancerPageSize,
  type AdministrativeDancerListFilters,
} from "@/lib/admin/dancers/dancers.shared";
import {
  toIdentificationStatus,
  toParticipationStatus,
} from "@/lib/admin/dancers/dancers.server.shared";
import {
  buildAdministrativeDancerWhere,
  readAdministrativeDancerFilters,
} from "@/lib/admin/dancers/dancers-list-filters.server";
import type { AdministrativeDancerListResult } from "@/lib/admin/dancers/dancers.server.types";
import { buildDancerEventParticipationSql } from "@/lib/people/participation.server";

export async function listAdministrativeDancers(input: {
  selectedEventId: string | null;
  filters: AdministrativeDancerListFilters;
}): Promise<AdministrativeDancerListResult> {
  const where = buildAdministrativeDancerWhere(input);

  const [{ count: totalUnfilteredCount }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId));

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .where(where);

  const totalCount = Number(count);
  const totalPages = Math.max(1, Math.ceil(totalCount / adminDancerPageSize));
  const page = Math.min(input.filters.page, totalPages);
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );
  const orderByName =
    input.filters.nameOrder === "desc"
      ? [
          desc(sql`lower(${dancers.firstName})`),
          desc(sql`lower(${dancers.lastName})`),
        ]
      : [
          asc(sql`lower(${dancers.firstName})`),
          asc(sql`lower(${dancers.lastName})`),
        ];

  const rows = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      active: dancers.active,
      academyName: academies.name,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      isParticipating: participationSql,
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .where(where)
    .orderBy(...orderByName, asc(dancers.id))
    .limit(adminDancerPageSize)
    .offset((page - 1) * adminDancerPageSize);

  return {
    filters: {
      ...input.filters,
      page,
    },
    hasAnyDancer: Number(totalUnfilteredCount) > 0,
    items: rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      active: row.active,
      academyName: row.academyName,
      participationStatus: toParticipationStatus(
        input.selectedEventId,
        row.isParticipating,
      ),
      identificationStatus: toIdentificationStatus({
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        documentFrontImageStorageKey: row.documentFrontImageStorageKey,
        documentBackImageStorageKey: row.documentBackImageStorageKey,
        identityVerifiedAt: row.identityVerifiedAt,
      }),
    })),
    totalCount,
    totalPages,
  };
}

export { readAdministrativeDancerFilters };

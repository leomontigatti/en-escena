import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, dancers, user } from "@/db/schema";
import {
  getEditConsequence,
  toIdentificationStatus,
  toParticipationStatus,
} from "@/lib/admin/dancers/dancers.server.shared";
import type { AdministrativeDancerDetail } from "@/lib/admin/dancers/dancers.server.types";
import { findAdministrativeDancerInscriptions } from "@/lib/admin/dancers/dancers-inscriptions.server";
import {
  buildDancerAnyEventParticipationSql,
  buildDancerEventParticipationSql,
} from "@/lib/participation/participation.server";

export async function findAdministrativeDancer(input: {
  dancerId: string;
  selectedEventId: string | null;
}): Promise<AdministrativeDancerDetail | null> {
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );

  const row = await db
    .select({
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
      active: dancers.active,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      createdAt: dancers.createdAt,
      updatedAt: dancers.updatedAt,
      academyId: academies.id,
      academyName: academies.name,
      academyContactName: academies.contactName,
      academyPhone: academies.phone,
      academyEmail: user.email,
      isParticipating: participationSql,
      hasParticipatedInAnyEvent: buildDancerAnyEventParticipationSql(),
    })
    .from(dancers)
    .innerJoin(academies, eq(academies.id, dancers.academyId))
    .innerJoin(user, eq(user.id, academies.userId))
    .where(eq(dancers.id, input.dancerId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) {
    return null;
  }

  const { choreographyRows, inscriptions } =
    await findAdministrativeDancerInscriptions({
      dancerId: input.dancerId,
      selectedEventId: input.selectedEventId,
    });

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    active: row.active,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    documentFrontImageStorageKey: row.documentFrontImageStorageKey,
    documentBackImageStorageKey: row.documentBackImageStorageKey,
    identityVerifiedAt: row.identityVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    academy: {
      id: row.academyId,
      name: row.academyName,
      contactName: row.academyContactName,
      email: row.academyEmail,
      phone: row.academyPhone,
    },
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
    participatedInAnyEvent: row.hasParticipatedInAnyEvent,
    correctionReasonRequired:
      getEditConsequence({
        selectedEventId: input.selectedEventId,
        isParticipating: row.isParticipating,
        hasParticipatedInAnyEvent: row.hasParticipatedInAnyEvent,
        isVerified: row.identityVerifiedAt !== null,
      }) !== null,
    inscriptions,
    choreographyNames: choreographyRows.map(
      (choreography) => choreography.name,
    ),
  };
}

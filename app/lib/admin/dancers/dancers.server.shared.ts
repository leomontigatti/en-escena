import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  deriveDancerVerificationStatus,
  type DancerVerificationStatus,
} from "@/lib/dancers/verification";
import {
  buildDancerAnyEventParticipationSql,
  buildDancerEventParticipationSql,
} from "@/lib/participation/participation.server";
import type { DancerEditableSnapshot } from "@/lib/dancers/dancer-records.server";

export type DancerMutationRecord = {
  id: string;
  academyId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  active: boolean;
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
  isParticipating: boolean;
  hasParticipatedInAnyEvent: boolean;
  verificationStatus: DancerVerificationStatus;
};

/**
 * Whether an edit may affect records of an event the dancer took part in. With
 * an event selected, a live inscription in it counts as well.
 */
export function editAffectsParticipation(input: {
  selectedEventId: string | null;
  isParticipating: boolean;
  hasParticipatedInAnyEvent: boolean;
}) {
  return input.selectedEventId !== null
    ? input.isParticipating || input.hasParticipatedInAnyEvent
    : input.hasParticipatedInAnyEvent;
}

export function toDancerSnapshot(
  dancer: Pick<
    typeof dancers.$inferSelect,
    | "firstName"
    | "lastName"
    | "birthDate"
    | "documentType"
    | "documentNumber"
    | "documentFrontImageStorageKey"
    | "documentBackImageStorageKey"
    | "identityVerifiedAt"
    | "active"
  >,
): DancerEditableSnapshot {
  return {
    firstName: dancer.firstName,
    lastName: dancer.lastName,
    birthDate: dancer.birthDate,
    documentType: dancer.documentType,
    documentNumber: dancer.documentNumber,
    documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
    documentBackImageStorageKey: dancer.documentBackImageStorageKey,
    identityVerifiedAt: dancer.identityVerifiedAt?.toISOString() ?? null,
    active: dancer.active,
  };
}

export async function findDancerForMutation(input: {
  dancerId: string;
  selectedEventId: string | null;
}): Promise<DancerMutationRecord | null> {
  const participationSql = buildDancerEventParticipationSql(
    input.selectedEventId,
  );
  const anyEventParticipationSql = buildDancerAnyEventParticipationSql();

  return db
    .select({
      id: dancers.id,
      academyId: dancers.academyId,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
      active: dancers.active,
      documentType: dancers.documentType,
      documentNumber: dancers.documentNumber,
      documentFrontImageStorageKey: dancers.documentFrontImageStorageKey,
      documentBackImageStorageKey: dancers.documentBackImageStorageKey,
      identityVerifiedAt: dancers.identityVerifiedAt,
      isParticipating: participationSql,
      hasParticipatedInAnyEvent: anyEventParticipationSql,
    })
    .from(dancers)
    .where(eq(dancers.id, input.dancerId))
    .limit(1)
    .then((rows) => rows[0] ?? null)
    .then((row) => {
      if (!row) {
        return null;
      }

      return {
        ...row,
        verificationStatus: deriveDancerVerificationStatus(row),
      };
    });
}

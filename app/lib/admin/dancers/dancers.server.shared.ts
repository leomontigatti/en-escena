import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { getDancerVerificationStatus } from "@/lib/dancers/verification";
import type {
  AdminDancerIdentificationStatus,
  AdminDancerNameOrder,
  AdminDancerParticipationStatus,
} from "@/lib/admin/dancers/dancers.shared";
import {
  buildDancerAnyEventParticipationSql,
  buildDancerEventParticipationSql,
} from "@/lib/people/participation.server";
import type { DancerEditableSnapshot } from "@/lib/dancers/dancer-records.server";

export type AdministrativeDancerMutationRecord = {
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
  correctionReasonRequired: boolean;
  identificationStatus: AdminDancerIdentificationStatus;
};

export function readDancerNameOrder(
  value: string | null,
): AdminDancerNameOrder {
  return value === "nombre:desc" ? "desc" : "asc";
}

export function readPage(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("pagina"));

  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

export function escapeForLike(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): AdminDancerParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
}

export function toIdentificationStatus(input: {
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
}): AdminDancerIdentificationStatus {
  const verificationStatus = getDancerVerificationStatus(input);

  switch (verificationStatus) {
    case "unverified":
      return "unverified";
    default:
      return verificationStatus;
  }
}

export function isCorrectionReasonRequired(input: {
  selectedEventId: string | null;
  isParticipating: boolean;
  hasParticipatedInAnyEvent: boolean;
  isVerified: boolean;
}) {
  if (input.isVerified) {
    return true;
  }

  if (input.selectedEventId !== null) {
    return input.isParticipating || input.hasParticipatedInAnyEvent;
  }

  return input.hasParticipatedInAnyEvent;
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

export async function findAdministrativeDancerForMutation(input: {
  dancerId: string;
  selectedEventId: string | null;
}): Promise<AdministrativeDancerMutationRecord | null> {
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
        correctionReasonRequired: isCorrectionReasonRequired({
          selectedEventId: input.selectedEventId,
          isParticipating: row.isParticipating,
          hasParticipatedInAnyEvent: row.hasParticipatedInAnyEvent,
          isVerified: row.identityVerifiedAt !== null,
        }),
        identificationStatus: toIdentificationStatus(row),
      };
    });
}

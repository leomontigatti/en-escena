import { eq } from "drizzle-orm";

import { dancers } from "@/db/schema";
import { findDancerNameWarning } from "@/lib/roster/roster-name-duplicates.server";
import {
  findDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";
import {
  applyDancerBirthDateCorrection,
  emptyDancerBirthDateCorrectionReport,
  loadLinkedChoreographyEventBasesForDancerBirthDateCorrection,
  runDancerWriteWithBirthDateCorrection,
} from "@/lib/choreographies/dancer-birthdate-correction.server";
import type { EventBases } from "@/lib/events/bases.server";
import type {
  DancerFieldErrors,
  DancerMutationResult,
  DancerUpdateInput,
} from "@/lib/admin/dancers/dancers.server.types";
import {
  findDancerDocumentConflict,
  writeDancerGuardingDocument,
  normalizeDancerDocumentPair,
  normalizeDancerValues,
} from "@/lib/dancers/dancer-records.server";

export async function updateAdministrativeDancer(input: {
  acknowledgedDuplicateIds?: readonly string[];
  dancerId: string;
  selectedEventId: string | null;
  values: DancerUpdateInput;
}): Promise<DancerMutationResult> {
  const existingDancer = await findDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const values = input.values;
  const fieldErrors: DancerFieldErrors = {};
  const normalizedValues = normalizeDancerValues(input.values);

  Object.assign(fieldErrors, normalizedValues.fieldErrors);

  const normalizedDocument = normalizeDancerDocumentPair(
    input.values.documentType,
    input.values.documentNumber,
  );
  if (!normalizedDocument.ok) {
    Object.assign(fieldErrors, normalizedDocument.fieldErrors);
  }

  if (!normalizedDocument.ok || Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors,
      values,
    };
  }

  const documentConflict =
    normalizedDocument.documentNumber === null
      ? null
      : await findDancerDocumentConflict({
          academyId: existingDancer.academyId,
          dancerId: existingDancer.id,
          documentNumber: normalizedDocument.documentNumber,
          scope: "admin",
        });

  if (documentConflict) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { documentNumber: documentConflict.message },
      values,
      duplicateDocumentDancerId: documentConflict.dancerId,
    };
  }

  // After the document pre-check, so a refusal always wins over a warning.
  const nameWarning = await findDancerNameWarning({
    academyId: existingDancer.academyId,
    acknowledgedDuplicateIds: input.acknowledgedDuplicateIds ?? [],
    birthDate: normalizedValues.birthDate,
    dancerId: existingDancer.id,
    firstName: normalizedValues.firstName,
    lastName: normalizedValues.lastName,
    scope: "admin",
  });

  if (nameWarning) {
    return { ok: false, warning: nameWarning };
  }

  const birthDateChanged =
    existingDancer.birthDate !== normalizedValues.birthDate;
  // Read before the transaction opens: the correction requires the bases, and
  // reading them from the pool inside its transaction would hold two
  // connections at once.
  const linkedChoreographyEventBases: Map<string, EventBases> = birthDateChanged
    ? await loadLinkedChoreographyEventBasesForDancerBirthDateCorrection({
        dancerId: existingDancer.id,
      })
    : new Map();
  // The dancer update and the recalculation share one transaction, so a
  // correction that leaves a choreography without a category rolls the dancer
  // row back as well.
  // The index can still refuse the number between the pre-check and the write.
  const guarded = await writeDancerGuardingDocument({
    academyId: existingDancer.academyId,
    dancerId: existingDancer.id,
    documentNumber: normalizedDocument.documentNumber,
    scope: "admin",
    write: () =>
      runDancerWriteWithBirthDateCorrection(async (tx) => {
        const [savedDancer] = await tx
          .update(dancers)
          .set({
            firstName: normalizedValues.firstName,
            lastName: normalizedValues.lastName,
            birthDate: normalizedValues.birthDate,
            documentType: normalizedDocument.documentType,
            documentNumber: normalizedDocument.documentNumber,
            documentFrontImageStorageKey:
              existingDancer.documentFrontImageStorageKey,
            documentBackImageStorageKey:
              existingDancer.documentBackImageStorageKey,
            identityVerifiedAt: existingDancer.identityVerifiedAt
              ? null
              : undefined,
            updatedAt: new Date(),
          })
          .where(eq(dancers.id, existingDancer.id))
          .returning();

        const correction = birthDateChanged
          ? await applyDancerBirthDateCorrection({
              dancerId: existingDancer.id,
              executor: tx,
              eventBasesByEventId: linkedChoreographyEventBases,
            })
          : emptyDancerBirthDateCorrectionReport;

        return { savedDancer, ...correction };
      }),
  });

  if (!guarded.ok) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { documentNumber: guarded.conflict.message },
      values,
      duplicateDocumentDancerId: guarded.conflict.dancerId,
    };
  }

  const write = guarded.result;

  if (!write.ok) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { birthDate: write.birthDateMessage },
      values,
    };
  }

  const savedSnapshot = toDancerSnapshot(write.result.savedDancer);

  return {
    ok: true,
    dancer: savedSnapshot,
    scheduleMoves: write.result.scheduleMoves,
    recategorisedChoreographies: write.result.recategorisedChoreographies,
    verificationInvalidated: existingDancer.identityVerifiedAt !== null,
  };
}

import { eq } from "drizzle-orm";

import { dancers } from "@/db/schema";
import {
  findDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";
import {
  applyDancerBirthDateCorrection,
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
  findDuplicateDancerDocument,
  normalizeDancerDocumentPair,
  normalizeDancerValues,
} from "@/lib/dancers/dancer-records.server";

export async function updateAdministrativeDancer(input: {
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

  if (
    normalizedDocument.documentType !== null &&
    normalizedDocument.documentNumber !== null
  ) {
    const duplicateDancer = await findDuplicateDancerDocument({
      academyId: existingDancer.academyId,
      dancerId: existingDancer.id,
      documentType: normalizedDocument.documentType,
      documentNumber: normalizedDocument.documentNumber,
    });

    if (duplicateDancer) {
      return {
        ok: false,
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentNumber:
            "Ya existe un Bailarín con ese documento en la academia.",
        },
        values,
      };
    }
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
  const write = await runDancerWriteWithBirthDateCorrection(async (tx) => {
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
        documentBackImageStorageKey: existingDancer.documentBackImageStorageKey,
        identityVerifiedAt: existingDancer.identityVerifiedAt
          ? null
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(dancers.id, existingDancer.id))
      .returning();

    return {
      dancer: savedDancer,
      scheduleMoves: birthDateChanged
        ? await applyDancerBirthDateCorrection({
            dancerId: existingDancer.id,
            executor: tx,
            eventBasesByEventId: linkedChoreographyEventBases,
          })
        : [],
    };
  });

  if (!write.ok) {
    return {
      ok: false,
      message: "Revisá los campos marcados.",
      fieldErrors: { birthDate: write.birthDateMessage },
      values,
    };
  }

  const savedSnapshot = toDancerSnapshot(write.dancer);

  return {
    ok: true,
    dancer: savedSnapshot,
    scheduleMoves: write.scheduleMoves,
    verificationInvalidated: existingDancer.identityVerifiedAt !== null,
  };
}

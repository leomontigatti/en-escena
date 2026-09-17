import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  findDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";
import {
  DancerBirthDateCorrectionRefusalError,
  loadLinkedChoreographyEventBasesForDancerBirthDateCorrection,
  recalculateLinkedChoreographiesForDancerBirthDateCorrection,
} from "@/lib/choreographies/dancer-birthdate-correction.server";
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
  const linkedChoreographyEventBases = birthDateChanged
    ? await loadLinkedChoreographyEventBasesForDancerBirthDateCorrection({
        dancerId: existingDancer.id,
      })
    : undefined;
  let updatedDancer;

  try {
    updatedDancer = await db.transaction(async (tx) => {
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

      if (birthDateChanged) {
        const recalculation =
          await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
            dancerId: existingDancer.id,
            executor: tx,
            eventBasesByEventId: linkedChoreographyEventBases,
          });

        // The dancer update and the recalculation share one transaction, so a
        // correction that leaves a choreography without a category rolls the
        // dancer row back as well.
        if (!recalculation.ok) {
          throw new DancerBirthDateCorrectionRefusalError(
            recalculation.choreographiesWithoutCategory,
          );
        }
      }

      return savedDancer;
    });
  } catch (error) {
    if (error instanceof DancerBirthDateCorrectionRefusalError) {
      return {
        ok: false,
        message: "Revisá los campos marcados.",
        fieldErrors: { birthDate: error.message },
        values,
      };
    }

    throw error;
  }

  const savedSnapshot = toDancerSnapshot(updatedDancer);

  return {
    ok: true,
    dancer: savedSnapshot,
    verificationInvalidated: existingDancer.identityVerifiedAt !== null,
  };
}

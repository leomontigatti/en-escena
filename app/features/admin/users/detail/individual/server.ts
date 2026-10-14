import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { academies, individuals, user } from "@/db/schema";
import {
  buildDetailActionError,
  buildDetailActionSuccess,
  type DetailActionData,
  type DetailSuccessData,
} from "@/lib/admin/users/user-detail.shared";
import { deriveIndividualLinkState } from "@/lib/individuals/link-state";
import {
  confirmIndividualLink,
  revokeIndividualLink,
  type IndividualLinkConfirmationRefusal,
} from "@/lib/individuals/link.server";
import {
  createDefaultIndividualDocumentPhotoStorage,
  loadIndividualDocumentPhotoUrl,
} from "@/lib/storage/individual-document-photos.server";

import {
  confirmedDocumentNumberField,
  confirmedDocumentPhotoField,
  confirmLinkIntent,
  revokeLinkIntent,
  type IndividualLinkDetail,
} from "./shared";

const notFoundMessage = "Usuario no encontrado.";

/**
 * The individual behind a user, as administration compares it before
 * confirming the link: its data, its document photo and its link state. `null`
 * for a user with no individual behind it.
 */
export async function loadIndividualLinkDetail(
  userId: string,
): Promise<IndividualLinkDetail | null> {
  const individual = await findIndividualOfUser(userId);

  if (!individual) {
    return null;
  }

  const linkState = deriveIndividualLinkState(individual);

  return {
    // A confirmation for a number the individual no longer holds is not one.
    confirmation:
      linkState === "linked" && individual.linkConfirmedAt
        ? {
            confirmedAt: individual.linkConfirmedAt,
            confirmedByName: individual.linkConfirmedByName,
          }
        : null,
    documentPhotoStorageKey: individual.documentPhotoStorageKey,
    documentPhotoUrl: await loadIndividualDocumentPhotoUrl({
      documentPhotoStorageKey: individual.documentPhotoStorageKey,
      storage: createDefaultIndividualDocumentPhotoStorage(),
    }),
    documentNumber: individual.documentNumber,
    documentType: individual.documentType,
    email: individual.email,
    firstName: individual.firstName,
    lastName: individual.lastName,
    linkState,
    phone: individual.phone,
  };
}

/**
 * `Confirmar vínculo` and `Revocar vínculo` on an individual's user, or `null`
 * when the intent is neither. The caller has already required a writer.
 */
export async function handleIndividualLinkAction(input: {
  formData: FormData;
  userId: string;
  writerId: string;
}): Promise<DetailActionData | DetailSuccessData | null> {
  const intent = input.formData.get("intent");

  if (intent !== confirmLinkIntent && intent !== revokeLinkIntent) {
    return null;
  }

  const individual = await findIndividualOfUser(input.userId);

  if (!individual) {
    throw new Response(notFoundMessage, { status: 404 });
  }

  if (intent === revokeLinkIntent) {
    const result = await revokeIndividualLink(individual.id);

    if (!result.ok) {
      throw new Response(notFoundMessage, { status: 404 });
    }

    return buildDetailActionSuccess("individual-link-revoked");
  }

  const result = await confirmIndividualLink({
    confirmedByUserId: input.writerId,
    documentNumber: readText(input.formData, confirmedDocumentNumberField),
    documentPhotoStorageKey: readText(
      input.formData,
      confirmedDocumentPhotoField,
    ),
    individualId: individual.id,
  });

  if (result.ok) {
    return buildDetailActionSuccess("individual-link-confirmed");
  }

  if (result.reason === "not-found") {
    throw new Response(notFoundMessage, { status: 404 });
  }

  return buildDetailActionError({
    form: "link",
    message: describeRefusal(result.reason),
  });
}

function describeRefusal(
  reason: Exclude<IndividualLinkConfirmationRefusal, "not-found">,
) {
  switch (reason) {
    case "document-changed":
      return "El particular cambió su documento mientras lo revisabas. Revisalo de nuevo antes de confirmar.";
    case "missing-photo":
      return "El particular todavía no subió la foto de su documento.";
    case "photo-changed":
      return "El particular cambió la foto de su documento mientras lo revisabas. Revisala de nuevo antes de confirmar.";
  }
}

function readText(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value : "";
}

const confirmingUser = alias(user, "confirming_user");

/** The individual whose owner row the user owns, if it has one. */
async function findIndividualOfUser(userId: string) {
  const [individual] = await db
    .select({
      documentNumber: individuals.documentNumber,
      documentPhotoStorageKey: individuals.documentPhotoStorageKey,
      documentType: individuals.documentType,
      email: user.email,
      firstName: individuals.firstName,
      id: individuals.id,
      lastName: individuals.lastName,
      linkConfirmedAt: individuals.linkConfirmedAt,
      linkConfirmedByName: confirmingUser.name,
      linkConfirmedDocumentNumber: individuals.linkConfirmedDocumentNumber,
      phone: academies.phone,
    })
    .from(individuals)
    .innerJoin(academies, eq(academies.id, individuals.academyId))
    .innerJoin(user, eq(user.id, academies.userId))
    .leftJoin(
      confirmingUser,
      eq(confirmingUser.id, individuals.linkConfirmedByUserId),
    )
    .where(eq(user.id, userId))
    .limit(1);

  return individual;
}

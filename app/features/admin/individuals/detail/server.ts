import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, individuals, user } from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import {
  requireAdminPanelReader,
  requireAdminPanelWriter,
} from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { deriveIndividualLinkState } from "@/lib/individuals/link-state";
import {
  confirmIndividualLink,
  previewIndividualLinkRosterRows,
  revokeIndividualLink,
  type IndividualLinkConfirmationRefusal,
} from "@/lib/individuals/link.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import {
  createDefaultIndividualDocumentPhotoStorage,
  loadIndividualDocumentPhotoUrl,
} from "@/lib/storage/individual-document-photos.server";

import { basePath } from "../shared";
import {
  confirmedDocumentNumberField,
  confirmedDocumentPhotoField,
  confirmLinkIntent,
  revokeLinkIntent,
  type IndividualDetailActionData,
} from "./shared";

const notFoundMessage = "No encontramos ese particular.";

/**
 * The individual as administration compares it before confirming: its data,
 * its document photo, and the academy rows its document would reach. The
 * auditor reads all of it.
 */
export async function loadIndividualDetail(input: {
  params: { individualId?: string };
  request: Request;
}) {
  const reader = await requireAdminPanelReader(input.request);
  const individual = await findIndividual(readIndividualId(input.params));
  const linkState = deriveIndividualLinkState(individual);
  const [documentPhotoUrl, reachedRows] = await Promise.all([
    loadIndividualDocumentPhotoUrl({
      documentPhotoStorageKey: individual.documentPhotoStorageKey,
      storage: createDefaultIndividualDocumentPhotoStorage(),
    }),
    previewIndividualLinkRosterRows(individual),
  ]);

  return {
    backToList: buildBackToListHref(readRequestedUrl(input.request).search),
    canWrite: canWriteInAdminPanel(reader.role),
    // A confirmation for a number the individual no longer holds is not one.
    confirmation:
      linkState === "linked" && individual.linkConfirmedAt
        ? {
            confirmedAt: individual.linkConfirmedAt,
            confirmedByName: individual.linkConfirmedByName,
          }
        : null,
    documentPhotoStorageKey: individual.documentPhotoStorageKey,
    documentPhotoUrl,
    individual: {
      documentNumber: individual.documentNumber,
      documentType: individual.documentType,
      email: individual.email,
      firstName: individual.firstName,
      id: individual.id,
      lastName: individual.lastName,
      phone: individual.phone,
    },
    linkState,
    reachedRows,
  };
}

/** `Confirmar vínculo` and `Revocar vínculo`: administration's alone. */
export async function handleIndividualDetailAction(input: {
  params: { individualId?: string };
  request: Request;
}): Promise<IndividualDetailActionData> {
  const writer = await requireAdminPanelWriter(input.request);
  const individualId = readIndividualId(input.params);
  const formData = await input.request.formData();
  const intent = formData.get("intent");

  if (intent === confirmLinkIntent) {
    const result = await confirmIndividualLink({
      confirmedByUserId: writer.id,
      documentNumber: readText(formData, confirmedDocumentNumberField),
      documentPhotoStorageKey: readText(formData, confirmedDocumentPhotoField),
      individualId,
    });

    if (result.ok) {
      return {
        status: "success",
        message: notificationToasts["individual-link-confirmed"].message,
      };
    }

    if (result.reason === "not-found") {
      throw new Response(notFoundMessage, { status: 404 });
    }

    return { status: "error", message: describeRefusal(result.reason) };
  }

  if (intent === revokeLinkIntent) {
    const result = await revokeIndividualLink(individualId);

    if (!result.ok) {
      throw new Response(notFoundMessage, { status: 404 });
    }

    return {
      status: "success",
      message: notificationToasts["individual-link-revoked"].message,
    };
  }

  throw new Response("Acción desconocida.", { status: 400 });
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

async function findIndividual(individualId: string) {
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
    .where(eq(individuals.id, individualId))
    .limit(1);

  if (!individual) {
    throw new Response(notFoundMessage, { status: 404 });
  }

  return individual;
}

function readIndividualId(params: { individualId?: string }) {
  if (!params.individualId) {
    throw new Response(notFoundMessage, { status: 404 });
  }

  return params.individualId;
}

/** The list the reader came from, with the query it carried. */
function buildBackToListHref(search: string) {
  return `${basePath}${search}`;
}

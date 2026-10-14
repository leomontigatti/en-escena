import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, individuals } from "@/db/schema";
import {
  toIndividualFullName,
  type IndividualPersonalData,
} from "@/lib/individuals/personal-data";
import type { UploadRejection } from "@/lib/storage/asset-kinds";
import {
  createDefaultIndividualDocumentPhotoStorage,
  type IndividualDocumentPhotoStorage,
} from "@/lib/storage/individual-document-photos.server";

/**
 * What a `Mis datos` save does to the individual's one document photo: leave
 * it, store a new one in its place, or remove it.
 */
export type IndividualDocumentPhotoChange =
  { kind: "keep" } | { kind: "remove" } | { file: Blob; kind: "upload" };

/**
 * Saves an individual's personal data where each part lives: the person and
 * its document photo on its `individual` row, the phone and the full name (as
 * `name` and `contactName`) on its owner row, together.
 *
 * A new photo is uploaded first, so a refused file saves nothing. The photo it
 * replaces, or the one removed, is deleted only after the rows are written, so
 * a failed save never leaves the row pointing at a deleted file; a failed
 * delete cannot undo the save, so it is logged instead, and
 * `[storage:individual-document-photo:orphan]` is what makes the leftover
 * object locatable.
 */
export async function updateIndividualPersonalData(input: {
  data: IndividualPersonalData;
  documentPhoto: IndividualDocumentPhotoChange;
  individual: {
    documentPhotoStorageKey: string | null;
    id: string;
    ownerId: string;
  };
  storage?: IndividualDocumentPhotoStorage;
}): Promise<{ ok: true } | { ok: false; rejection: UploadRejection }> {
  const { data, individual } = input;
  const storage =
    input.storage ?? createDefaultIndividualDocumentPhotoStorage();
  const documentPhotoStorageKey = await resolveDocumentPhotoStorageKey({
    change: input.documentPhoto,
    individual,
    storage,
  });

  if (!documentPhotoStorageKey.ok) {
    return documentPhotoStorageKey;
  }

  const fullName = toIndividualFullName(data);
  const updatedAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(individuals)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        // `undefined` when the photo is kept: the column is left as it is.
        documentPhotoStorageKey: documentPhotoStorageKey.value,
        updatedAt,
      })
      .where(eq(individuals.id, individual.id));
    await tx
      .update(academies)
      .set({
        name: fullName,
        contactName: fullName,
        phone: data.phone,
        updatedAt,
      })
      .where(eq(academies.id, individual.ownerId));
  });

  const replacedStorageKey = individual.documentPhotoStorageKey;

  if (
    documentPhotoStorageKey.value !== undefined &&
    replacedStorageKey !== null &&
    replacedStorageKey !== documentPhotoStorageKey.value
  ) {
    await removeReplacedDocumentPhoto({
      individualId: individual.id,
      storage,
      storageKey: replacedStorageKey,
    });
  }

  return { ok: true };
}

async function resolveDocumentPhotoStorageKey(input: {
  change: IndividualDocumentPhotoChange;
  individual: { documentPhotoStorageKey: string | null; id: string };
  storage: IndividualDocumentPhotoStorage;
}): Promise<
  | { ok: false; rejection: UploadRejection }
  | { ok: true; value: string | null | undefined }
> {
  switch (input.change.kind) {
    case "keep":
      return { ok: true, value: undefined };
    case "remove":
      return { ok: true, value: null };
    case "upload": {
      const uploaded = await input.storage.uploadDocumentPhoto({
        file: input.change.file,
        individualId: input.individual.id,
      });

      return uploaded.ok
        ? { ok: true, value: uploaded.storageKey }
        : { ok: false, rejection: uploaded.rejection };
    }
  }
}

async function removeReplacedDocumentPhoto(input: {
  individualId: string;
  storage: IndividualDocumentPhotoStorage;
  storageKey: string;
}) {
  try {
    await input.storage.removeDocumentPhoto(input.storageKey);
  } catch (thrown) {
    console.error("[storage:individual-document-photo:orphan]", {
      detail: thrown instanceof Error ? thrown.message : String(thrown),
      individualId: input.individualId,
      storageKey: input.storageKey,
    });
  }
}

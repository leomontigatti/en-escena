import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventDocuments } from "@/db/schema";
import {
  eventDocumentKinds,
  getEventDocumentSubjectOptions,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import {
  loadEventDocumentDownloadUrl,
  type EventDocumentStorage,
} from "@/lib/storage/event-documents.server";

export type EventDocumentSummary = {
  downloadUrl: string | null;
  uploadedAt: Date;
};

/** One entry per kind, `null` where the event has no document yet. */
export type EventDocumentSummaries = Record<
  EventDocumentKind,
  EventDocumentSummary | null
>;

export type EventDocumentDownloadUrls = Record<
  EventDocumentKind,
  string | null
>;

export type EventDocumentMutationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * The one event-document read path. It always answers for every kind, so a
 * surface renders "no document" from a value instead of from a missing key —
 * the portal menus offer all three whether or not they exist.
 */
export async function loadEventDocumentSummaries(input: {
  eventId: string | null;
  storage: EventDocumentStorage;
}): Promise<EventDocumentSummaries> {
  const summaries = buildEmptySummaries();

  if (!input.eventId) {
    return summaries;
  }

  const rows = await db.query.eventDocuments.findMany({
    columns: { kind: true, storageKey: true, uploadedAt: true },
    where: eq(eventDocuments.eventId, input.eventId),
  });

  await Promise.all(
    rows.map(async (row) => {
      summaries[row.kind] = {
        downloadUrl: await loadEventDocumentDownloadUrl({
          kind: row.kind,
          storage: input.storage,
          storageKey: row.storageKey,
        }),
        uploadedAt: row.uploadedAt,
      };
    }),
  );

  return summaries;
}

/**
 * The download links alone, for the surfaces that only offer the documents. A
 * `null` is "not available", which the portal menus render as a disabled item
 * rather than by hiding it.
 */
export async function loadEventDocumentDownloadUrls(input: {
  eventId: string | null;
  storage: EventDocumentStorage;
}): Promise<EventDocumentDownloadUrls> {
  const summaries = await loadEventDocumentSummaries(input);

  return Object.fromEntries(
    eventDocumentKinds.map((kind) => [
      kind,
      summaries[kind]?.downloadUrl ?? null,
    ]),
  ) as EventDocumentDownloadUrls;
}

/**
 * Uploads the bytes and then points the event at them. The key is stable per
 * `(eventId, kind)`, so a replace overwrites the object and updates the one
 * row instead of adding a second one.
 */
export async function saveEventDocument(input: {
  eventId: string;
  file: File;
  kind: EventDocumentKind;
  storage: EventDocumentStorage;
}): Promise<EventDocumentMutationResult> {
  const uploaded = await input.storage.uploadDocument({
    eventId: input.eventId,
    file: input.file,
    kind: input.kind,
  });

  // A policy rejection is the administration's to fix, so it becomes a message
  // rather than an exception. Nothing is written: the event still points at the
  // document it had.
  if (!uploaded.ok) {
    return {
      ok: false,
      message: formatUploadRejection(
        uploaded.rejection,
        getEventDocumentSubjectOptions(input.kind),
      ),
    };
  }

  await db
    .insert(eventDocuments)
    .values({
      eventId: input.eventId,
      kind: input.kind,
      storageKey: uploaded.storageKey,
    })
    .onConflictDoUpdate({
      target: [eventDocuments.eventId, eventDocuments.kind],
      set: { storageKey: uploaded.storageKey, uploadedAt: new Date() },
    });

  return { ok: true };
}

export async function deleteEventDocument(input: {
  eventId: string;
  kind: EventDocumentKind;
  storage: EventDocumentStorage;
}): Promise<EventDocumentMutationResult> {
  const [deleted] = await db
    .delete(eventDocuments)
    .where(
      and(
        eq(eventDocuments.eventId, input.eventId),
        eq(eventDocuments.kind, input.kind),
      ),
    )
    .returning({ storageKey: eventDocuments.storageKey });

  if (!deleted) {
    return { ok: false, message: "Ese documento ya no está cargado." };
  }

  try {
    await input.storage.removeDocument(deleted.storageKey);
  } catch (thrown) {
    // The row is already gone, so propagating would tell the administration the
    // delete failed when the document is no longer offered anywhere. The cost
    // is an object left on the volume, and this line is the only thing that
    // makes it locatable without walking the volume by hand.
    console.error("[storage:event-document:orphan]", {
      detail: thrown instanceof Error ? thrown.message : String(thrown),
      eventId: input.eventId,
      kind: input.kind,
      storageKey: deleted.storageKey,
    });
  }

  return { ok: true };
}

function buildEmptySummaries(): EventDocumentSummaries {
  return Object.fromEntries(
    eventDocumentKinds.map((kind) => [kind, null]),
  ) as EventDocumentSummaries;
}

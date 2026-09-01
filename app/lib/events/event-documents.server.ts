import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventDocuments } from "@/db/schema";
import {
  eventDocumentKinds,
  getEventDocumentSubjectOptions,
  type EventDocumentDownloadUrls,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import {
  createDefaultEventDocumentStorage,
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
 * rather than by hiding it. Module-private: every caller so far wants the
 * active event from the default store, which is `loadPortalEventDocumentDownloadUrls`.
 */
async function loadEventDocumentDownloadUrls(input: {
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
 * The download links for the event a portal list is showing. Both list loaders
 * want exactly this — the active event's links, from the default store — so it
 * lives here once rather than as the same four lines on each surface.
 *
 * Offered to any authenticated academy user, with no further gate: these are
 * blank forms an academy needs *before* registering, so gating them behind a
 * registration would invert the real order of operations.
 */
export async function loadPortalEventDocumentDownloadUrls(
  eventId: string | null,
): Promise<EventDocumentDownloadUrls> {
  return await loadEventDocumentDownloadUrls({
    eventId,
    storage: createDefaultEventDocumentStorage(),
  });
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
  const existing = await db.query.eventDocuments.findFirst({
    columns: { storageKey: true },
    where: and(
      eq(eventDocuments.eventId, input.eventId),
      eq(eventDocuments.kind, input.kind),
    ),
  });

  if (!existing) {
    return { ok: false, message: "Ese documento ya no está cargado." };
  }

  // The bytes go first, and the row only once they are gone. The other order
  // reports success while the object survives, which is the one outcome
  // "eliminar" must not mean; this way a storage failure leaves the pair intact
  // and the administration can retry. `removeDocument` tolerates an object that
  // is already absent, so the retry converges.
  await input.storage.removeDocument(existing.storageKey);

  await db
    .delete(eventDocuments)
    .where(
      and(
        eq(eventDocuments.eventId, input.eventId),
        eq(eventDocuments.kind, input.kind),
      ),
    );

  return { ok: true };
}

function buildEmptySummaries(): EventDocumentSummaries {
  return Object.fromEntries(
    eventDocumentKinds.map((kind) => [kind, null]),
  ) as EventDocumentSummaries;
}

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { eventDocuments, events } from "@/db/schema";
import {
  loadEventDetail,
  updateAdministrativeEvent,
} from "@/features/admin/events/detail/server";
import {
  eventDocumentFileField,
  eventDocumentKeptField,
  eventDocumentsPresentField,
  keptEventDocumentValue,
} from "@/features/admin/events/detail/shared";
import { eventFormValues } from "@/lib/admin/events/form-values";
import {
  eventDocumentKinds,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import { createAdminSavedEvent } from "@/lib/events/saved-event-test-support.server";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

const createDocumentSignedUrlMock = vi.hoisted(() => vi.fn());
const removeDocumentMock = vi.hoisted(() => vi.fn());
const uploadDocumentMock = vi.hoisted(() => vi.fn());

// Only the factory is replaced: the key layout, the policy and the shared read
// path stay real, so this test cannot drift from them.
vi.mock("@/lib/storage/event-documents.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/event-documents.server")
  >()),
  createDefaultEventDocumentStorage: () => ({
    createDocumentSignedUrl: createDocumentSignedUrlMock,
    removeDocument: removeDocumentMock,
    uploadDocument: uploadDocumentMock,
  }),
}));

installDatabaseTestHooks();

let uploadedKeys: string[] = [];
let removedKeys: string[] = [];

beforeEach(() => {
  uploadedKeys = [];
  removedKeys = [];
  createDocumentSignedUrlMock.mockReset();
  removeDocumentMock.mockReset();
  uploadDocumentMock.mockReset();
  createDocumentSignedUrlMock.mockImplementation(
    async ({ storageKey }: { storageKey: string }) => `signed:${storageKey}`,
  );
  removeDocumentMock.mockImplementation(async (storageKey: string) => {
    removedKeys.push(storageKey);
  });
  uploadDocumentMock.mockImplementation(
    async ({ eventId, kind }: { eventId: string; kind: string }) => {
      const storageKey = `events/${eventId}/documents/${kind}.pdf`;

      uploadedKeys.push(storageKey);

      return { ok: true as const, storageKey };
    },
  );
});

type EventRow = Awaited<ReturnType<typeof createAdminSavedEvent>>;

/** What the detail form stages for one document before "Guardar" is pressed. */
type DocumentChange = "keep" | "remove" | "upload";

describe.sequential("event documents on the event detail action", () => {
  test("an upload creates the row the detail view then offers", async () => {
    const event = await createAdminSavedEvent();

    const result = await save(event, { professor_contract: "upload" });

    expect(result).toEqual({ status: "success", message: "Evento guardado." });
    expect(uploadedKeys).toEqual([
      `events/${event.id}/documents/professor_contract.pdf`,
    ]);

    const loaderData = await loadEventDetail(
      await createAdminRequest(event.id),
      event.id,
    );

    expect(loaderData.documents.professor_contract?.downloadUrl).toBe(
      `signed:events/${event.id}/documents/professor_contract.pdf`,
    );
    expect(loaderData.documents.minor_authorization).toBeNull();
  });

  test("a re-upload replaces the row instead of adding a second one", async () => {
    const event = await createAdminSavedEvent();

    await save(event, { adult_contract: "upload" });
    const first = await readDocumentRows(event.id);

    await save(event, { adult_contract: "upload" });
    const second = await readDocumentRows(event.id);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
  });

  // The save is the whole form, so a document nobody touched has to survive the
  // trip: the "kept" field is what says so.
  test("a save that touches nothing leaves the documents alone", async () => {
    const event = await createAdminSavedEvent();
    await save(event, { minor_authorization: "upload" });

    const result = await save(event, {});

    expect(result).toEqual({ status: "success", message: "Evento guardado." });
    expect(await readDocumentRows(event.id)).toHaveLength(1);
    expect(removedKeys).toEqual([]);
  });

  test("clearing a document removes the row and the bytes on save", async () => {
    const event = await createAdminSavedEvent();
    await save(event, { minor_authorization: "upload" });

    const result = await save(event, { minor_authorization: "remove" });

    expect(result).toEqual({ status: "success", message: "Evento guardado." });
    expect(await readDocumentRows(event.id)).toEqual([]);
    expect(removedKeys).toEqual([
      `events/${event.id}/documents/minor_authorization.pdf`,
    ]);
  });

  // Choosing a file after clearing the field is a replacement. Reading it as a
  // removal would delete the bytes the administration was replacing.
  test("a file wins over a cleared field", async () => {
    const event = await createAdminSavedEvent();
    await save(event, { adult_contract: "upload" });
    removedKeys = [];

    await save(event, { adult_contract: "upload" }, { keep: [] });

    expect(removedKeys).toEqual([]);
    expect(await readDocumentRows(event.id)).toHaveLength(1);
  });

  // A body that never carried the document fields is not "remove all three".
  test("a submission without the document fields keeps them", async () => {
    const event = await createAdminSavedEvent();
    await save(event, { professor_contract: "upload" });

    const body = eventFormBody(event);
    const result = await updateAdministrativeEvent(
      await createAdminRequest(event.id, body),
      event.id,
    );

    expect(result).toEqual({ status: "success", message: "Evento guardado." });
    expect(await readDocumentRows(event.id)).toHaveLength(1);
    expect(removedKeys).toEqual([]);
  });

  test("a storage failure leaves the document offered instead of half-deleted", async () => {
    const event = await createAdminSavedEvent();
    await save(event, { adult_contract: "upload" });
    removeDocumentMock.mockRejectedValueOnce(new Error("volume unavailable"));

    await expect(save(event, { adult_contract: "remove" })).rejects.toThrow(
      "volume unavailable",
    );

    // The row survives, so the pair stays consistent and the administration can
    // retry — the alternative reports success over bytes that are still there.
    expect(await readDocumentRows(event.id)).toHaveLength(1);
  });

  test("the event fields are refused before any document is touched", async () => {
    const event = await createAdminSavedEvent();

    const body = documentsBody(event, { professor_contract: "upload" });
    body.set("name", "");

    const result = await updateAdministrativeEvent(
      await createAdminRequest(event.id, body),
      event.id,
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Revisá los datos del evento.",
    });
    expect(uploadDocumentMock).not.toHaveBeenCalled();
    expect(await readDocumentRows(event.id)).toEqual([]);
  });

  test("deleting the event takes its documents with it", async () => {
    const event = await createAdminSavedEvent();
    await save(event, { professor_contract: "upload" });

    await db.delete(events).where(eq(events.id, event.id));

    expect(await readDocumentRows(event.id)).toEqual([]);
  });
});

async function readDocumentRows(eventId: string) {
  return await db
    .select()
    .from(eventDocuments)
    .where(eq(eventDocuments.eventId, eventId));
}

async function createAdminRequest(eventId: string, body?: FormData) {
  const { request } = await createSignedInAdminRequest({
    body,
    email: `documentos.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/eventos/${eventId}`,
    role: "admin",
  });

  return request;
}

function eventFormBody(event: EventRow) {
  const body = new FormData();

  body.set("intent", "update");

  for (const [field, value] of Object.entries(eventFormValues(event))) {
    body.set(field, value);
  }

  return body;
}

/**
 * The body the detail form posts: the event's own fields plus one file input
 * and one "kept" marker per document. `keep` overrides which documents the
 * marker claims, so a test can post a file for a field it also cleared.
 */
function documentsBody(
  event: EventRow,
  changes: Partial<Record<EventDocumentKind, DocumentChange>>,
  options: { keep?: EventDocumentKind[] } = {},
) {
  const body = eventFormBody(event);

  body.set(eventDocumentsPresentField, keptEventDocumentValue);

  for (const kind of eventDocumentKinds) {
    const change = changes[kind] ?? "keep";
    const isKept = options.keep
      ? options.keep.includes(kind)
      : change !== "remove";

    body.set(
      eventDocumentKeptField(kind),
      isKept ? keptEventDocumentValue : "",
    );

    if (change === "upload") {
      body.set(
        eventDocumentFileField(kind),
        new File(["pdf-bytes"], "documento.pdf", { type: "application/pdf" }),
      );
    }
  }

  return body;
}

async function save(
  event: EventRow,
  changes: Partial<Record<EventDocumentKind, DocumentChange>>,
  options: { keep?: EventDocumentKind[] } = {},
) {
  const body = documentsBody(event, changes, options);

  return await updateAdministrativeEvent(
    await createAdminRequest(event.id, body),
    event.id,
  );
}

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { eventDocuments, events } from "@/db/schema";
import {
  loadEventDetail,
  updateAdministrativeEvent,
} from "@/features/admin/events/detail/server";
import {
  deleteEventDocumentIntent,
  uploadEventDocumentIntent,
} from "@/features/admin/events/detail/shared";
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

describe.sequential("event documents on the event detail action", () => {
  test("an upload creates the row the detail view then offers", async () => {
    const event = await createAdminSavedEvent();

    const result = await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "professor_contract",
    });

    expect(result).toEqual({
      status: "success",
      message: "Documento cargado.",
    });
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

    await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "adult_contract",
    });
    const first = await readDocumentRows(event.id);

    await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "adult_contract",
    });
    const second = await readDocumentRows(event.id);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
  });

  test("a delete removes the row and the bytes", async () => {
    const event = await createAdminSavedEvent();
    await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "minor_authorization",
    });

    const result = await postDocument(event.id, {
      intent: deleteEventDocumentIntent,
      kind: "minor_authorization",
    });

    expect(result).toEqual({
      status: "success",
      message: "Documento eliminado.",
    });
    expect(await readDocumentRows(event.id)).toEqual([]);
    expect(removedKeys).toEqual([
      `events/${event.id}/documents/minor_authorization.pdf`,
    ]);
  });

  test("a storage failure leaves the document offered instead of half-deleted", async () => {
    const event = await createAdminSavedEvent();
    await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "adult_contract",
    });
    removeDocumentMock.mockRejectedValueOnce(new Error("volume unavailable"));

    await expect(
      postDocument(event.id, {
        intent: deleteEventDocumentIntent,
        kind: "adult_contract",
      }),
    ).rejects.toThrow("volume unavailable");

    // The row survives, so the pair stays consistent and the administration can
    // retry — the alternative reports success over bytes that are still there.
    expect(await readDocumentRows(event.id)).toHaveLength(1);
  });

  test("a kind that is not a document is refused rather than trusted", async () => {
    const event = await createAdminSavedEvent();

    const uploadResult = await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "bases_del_evento",
    });
    const deleteResult = await postDocument(event.id, {
      intent: deleteEventDocumentIntent,
      kind: "bases_del_evento",
    });

    expect(uploadResult).toMatchObject({
      status: "error",
      message: "No pudimos reconocer ese documento.",
    });
    expect(deleteResult).toMatchObject({ status: "error" });
    expect(uploadDocumentMock).not.toHaveBeenCalled();
    expect(await readDocumentRows(event.id)).toEqual([]);
  });

  test("an upload without a file is refused", async () => {
    const event = await createAdminSavedEvent();

    const result = await postDocument(
      event.id,
      { intent: uploadEventDocumentIntent, kind: "adult_contract" },
      { withFile: false },
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Elegí un archivo para cargar.",
    });
    expect(await readDocumentRows(event.id)).toEqual([]);
  });

  test("deleting the event takes its documents with it", async () => {
    const event = await createAdminSavedEvent();
    await postDocument(event.id, {
      intent: uploadEventDocumentIntent,
      kind: "professor_contract",
    });

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

async function postDocument(
  eventId: string,
  fields: { intent: string; kind: string },
  options: { withFile?: boolean } = {},
) {
  const body = new FormData();

  body.set("intent", fields.intent);
  body.set("kind", fields.kind);

  if (
    options.withFile !== false &&
    fields.intent === uploadEventDocumentIntent
  ) {
    body.set(
      "documentFile",
      new File(["pdf-bytes"], "documento.pdf", { type: "application/pdf" }),
    );
  }

  return await updateAdministrativeEvent(
    await createAdminRequest(eventId, body),
    eventId,
  );
}

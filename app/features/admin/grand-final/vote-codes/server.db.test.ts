import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  createInactiveEvent,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import { createVoteCodeBatch } from "@/lib/grand-final/vote-codes.server";

import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "../list/server";
import { loadVoteCodeSheet } from "./server";
import { createVoteCodeBatchIntent, voidVoteCodeBatchIntent } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/gran-final";

async function signedIn(
  requestUrl: string,
  body?: FormData,
  role: "admin" | "auditor" = "admin",
) {
  const { request } = await createSignedInRequest({
    body,
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl,
    role,
  });

  return request;
}

async function submit(
  values: Record<string, string>,
  role: "admin" | "auditor" = "admin",
) {
  const body = new FormData();

  for (const [name, value] of Object.entries(values)) {
    body.set(name, value);
  }

  return await handleGrandFinalListAction(await signedIn(listUrl, body, role));
}

async function listBatches() {
  return (await loadGrandFinalListRouteData(await signedIn(listUrl)))
    .voteCodeBatches;
}

async function printSheet(batchId: string) {
  const sheetUrl = `http://localhost/administracion/gran-final/codigos-qr/${batchId}`;

  return await loadVoteCodeSheet(await signedIn(sheetUrl), batchId);
}

describe("the QR code batches of the `Gran final` list", () => {
  test("generates a batch of the count asked and lists it", async () => {
    await createSavedEvent();

    await expect(
      submit({ count: "25", intent: createVoteCodeBatchIntent }),
    ).resolves.toEqual({
      message:
        "Generaste el lote 1 con 25 códigos QR. Imprimilo desde la lista de lotes.",
      status: "success",
    });
    await expect(listBatches()).resolves.toMatchObject([
      { codeCount: 25, number: 1, voidedAt: null },
    ]);
  });

  test("refuses a count outside 1 to 1000 and issues nothing", async () => {
    await createSavedEvent();

    for (const count of ["0", "1001", "2.5"]) {
      await expect(
        submit({ count, intent: createVoteCodeBatchIntent }),
      ).resolves.toMatchObject({
        data: {
          message: "Ingresá un número entero entre 1 y 1000.",
          status: "error",
        },
        init: { status: 400 },
      });
    }

    await expect(
      submit({ count: " ", intent: createVoteCodeBatchIntent }),
    ).resolves.toMatchObject({
      data: { message: "Este campo es obligatorio." },
      init: { status: 400 },
    });
    await expect(listBatches()).resolves.toEqual([]);
  });

  test("voids a batch, and refuses voiding it again", async () => {
    await createSavedEvent();
    await submit({ count: "3", intent: createVoteCodeBatchIntent });
    const [batch] = await listBatches();

    await expect(
      submit({ batchId: batch.id, intent: voidVoteCodeBatchIntent }),
    ).resolves.toEqual({
      message: "Anulaste el lote 1. Sus códigos QR ya no sirven para votar.",
      status: "success",
    });
    await expect(
      submit({ batchId: batch.id, intent: voidVoteCodeBatchIntent }),
    ).resolves.toMatchObject({
      data: {
        message:
          "Ese lote ya estaba anulado. Sus códigos QR no sirven para votar.",
        status: "error",
      },
      init: { status: 409 },
    });
  });

  test("leaves a batch of an event that is not the active one alone", async () => {
    const past = await createInactiveEvent("En Escena 2025");
    const batch = await createVoteCodeBatch({ count: 1, eventId: past.id });
    await createSavedEvent();

    await expect(
      submit({ batchId: batch.id, intent: voidVoteCodeBatchIntent }),
    ).resolves.toMatchObject({ init: { status: 404 } });
    await expectThrownResponse(printSheet(batch.id), 404);
  });

  test("turns the auditor away from both writes and from the printout", async () => {
    await createSavedEvent();
    await submit({ count: "1", intent: createVoteCodeBatchIntent });
    const [batch] = await listBatches();

    await expectThrownResponse(
      submit({ count: "1", intent: createVoteCodeBatchIntent }, "auditor"),
      403,
    );
    await expectThrownResponse(
      submit({ batchId: batch.id, intent: voidVoteCodeBatchIntent }, "auditor"),
      403,
    );
    await expectThrownResponse(
      loadVoteCodeSheet(
        await signedIn(listUrl, undefined, "auditor"),
        batch.id,
      ),
      403,
    );
    await expect(listBatches()).resolves.toMatchObject([
      { codeCount: 1, voidedAt: null },
    ]);
  });

  test("prints one QR per code of the batch, on the vote URL", async () => {
    await createSavedEvent();
    await submit({ count: "3", intent: createVoteCodeBatchIntent });
    const [batch] = await listBatches();

    const response = await printSheet(batch.id);
    const html = await response.text();

    expect(response.headers.get("Content-Type")).toContain("text/html");
    // The sheet carries live tokens: no browser or proxy keeps a copy.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html.match(/<svg/g)).toHaveLength(3);
    expect(html).toContain("Lote 1 · 3/3");
  });

  test("does not print a voided batch", async () => {
    await createSavedEvent();
    await submit({ count: "2", intent: createVoteCodeBatchIntent });
    const [batch] = await listBatches();
    await submit({ batchId: batch.id, intent: voidVoteCodeBatchIntent });

    await expectThrownResponse(printSheet(batch.id), 409);
    expect(
      (await listBatches())[0].blockReasons.map((reason) => reason.code),
    ).toEqual(["voided"]);
  });
});

import { describe, expect, test } from "vitest";

import { createSavedEvent } from "@/lib/admin/finances/finances.test-support";
import {
  createVoteCodeBatch,
  listVoteCodeBatches,
  readVoteCode,
  readVoteCodeBatch,
  voidVoteCodeBatch,
} from "@/lib/grand-final/vote-codes.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`createVoteCodeBatch`", () => {
  test("issues the batch with as many codes as asked, listed as not voided", async () => {
    const event = await createSavedEvent();

    const batch = await createVoteCodeBatch({ count: 5, eventId: event.id });

    await expect(listVoteCodeBatches(event.id)).resolves.toEqual([
      {
        codeCount: 5,
        id: batch.id,
        issuedAt: expect.any(Date),
        number: 1,
        voidedAt: null,
      },
    ]);
  });

  test("numbers each event's batches on their own, and two issued at once never share a number", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();

    await createVoteCodeBatch({ count: 1, eventId: event.id });
    await Promise.all([
      createVoteCodeBatch({ count: 1, eventId: event.id }),
      createVoteCodeBatch({ count: 1, eventId: event.id }),
    ]);
    await createVoteCodeBatch({ count: 1, eventId: other.id });

    const numbers = async (eventId: string) =>
      (await listVoteCodeBatches(eventId)).map((batch) => batch.number);

    await expect(numbers(event.id)).resolves.toEqual([3, 2, 1]);
    await expect(numbers(other.id)).resolves.toEqual([1]);
  });

  test("gives every code a distinct 128-bit random token, across batches and events", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();
    const batches = await Promise.all([
      createVoteCodeBatch({ count: 200, eventId: event.id }),
      createVoteCodeBatch({ count: 200, eventId: other.id }),
    ]);
    const tokens = (
      await Promise.all([
        readVoteCodeBatch({ batchId: batches[0].id, eventId: event.id }),
        readVoteCodeBatch({ batchId: batches[1].id, eventId: other.id }),
      ])
    ).flatMap((batch) => batch?.tokens ?? []);

    expect(tokens).toHaveLength(400);
    expect(new Set(tokens).size).toBe(400);
    expect(tokens.every((token) => /^[A-Za-z0-9_-]{22}$/.test(token))).toBe(
      true,
    );
  });
});

describe("`readVoteCodeBatch`", () => {
  test("reads nothing of another event's batch", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();
    const batch = await createVoteCodeBatch({ count: 1, eventId: other.id });

    await expect(
      readVoteCodeBatch({ batchId: batch.id, eventId: event.id }),
    ).resolves.toBeNull();
  });
});

describe("`voidVoteCodeBatch`", () => {
  test("voids every code in the batch and none in another", async () => {
    const event = await createSavedEvent();
    const lost = await createVoteCodeBatch({ count: 3, eventId: event.id });
    const kept = await createVoteCodeBatch({ count: 2, eventId: event.id });

    await expect(
      voidVoteCodeBatch({ batchId: lost.id, eventId: event.id }),
    ).resolves.toEqual({ number: 1, ok: true });

    const read = async (batchId: string) =>
      Promise.all(
        (
          (await readVoteCodeBatch({ batchId, eventId: event.id }))?.tokens ??
          []
        ).map((token) => readVoteCode(token)),
      );

    expect((await read(lost.id)).map((code) => code?.voided)).toEqual([
      true,
      true,
      true,
    ]);
    expect((await read(kept.id)).map((code) => code?.voided)).toEqual([
      false,
      false,
    ]);
    expect(
      (await listVoteCodeBatches(event.id)).map((batch) => [
        batch.number,
        batch.voidedAt !== null,
      ]),
    ).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  test("refuses a batch already voided, keeping when it was voided", async () => {
    const event = await createSavedEvent();
    const batch = await createVoteCodeBatch({ count: 1, eventId: event.id });
    await voidVoteCodeBatch({ batchId: batch.id, eventId: event.id });
    const [{ voidedAt }] = await listVoteCodeBatches(event.id);

    await expect(
      voidVoteCodeBatch({ batchId: batch.id, eventId: event.id }),
    ).resolves.toEqual({ ok: false, reason: "already-voided" });
    await expect(listVoteCodeBatches(event.id)).resolves.toMatchObject([
      { voidedAt },
    ]);
  });

  test("refuses another event's batch and leaves it valid", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();
    const batch = await createVoteCodeBatch({ count: 1, eventId: other.id });

    await expect(
      voidVoteCodeBatch({ batchId: batch.id, eventId: event.id }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(listVoteCodeBatches(other.id)).resolves.toMatchObject([
      { voidedAt: null },
    ]);
  });
});

describe("`readVoteCode`", () => {
  test("knows nothing of a token no batch issued", async () => {
    await expect(readVoteCode("no-such-token")).resolves.toBeNull();
  });
});

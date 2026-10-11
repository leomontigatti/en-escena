import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PgDatabase } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { unexpectedErrors } from "@/db/schema";

import { recordUnexpectedError } from "./unexpected-error-store.server";
import type { UnexpectedErrorEntry } from "./unexpected-error-store.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const at = new Date("2026-10-11T12:00:00.000Z");

function entry(overrides: Partial<UnexpectedErrorEntry> = {}) {
  return {
    source: "server",
    route: "/administracion/academias/:academyId",
    method: "GET",
    userId: "user-123",
    at,
    release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
    stack:
      "TypeError: Cannot read properties of undefined (reading 'name')\n    at loader (/app/build/server/index.js:120:7)",
    ...overrides,
  } satisfies UnexpectedErrorEntry;
}

function minutesLater(minutes: number) {
  return new Date(at.getTime() + minutes * 60_000);
}

describe("recordUnexpectedError", () => {
  test("keeps the error as a row and alerts the first time", async () => {
    const sendAlert = vi.fn(async () => true);

    await recordUnexpectedError(entry(), { sendAlert });

    const rows = await db.select().from(unexpectedErrors);
    expect(rows).toEqual([
      expect.objectContaining({
        source: "server",
        route: "/administracion/academias/:academyId",
        method: "GET",
        userId: "user-123",
        release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
        stack: entry().stack,
        signature: expect.stringMatching(/^[0-9a-f]{64}$/),
        createdAt: at,
        alertedAt: at,
      }),
    ]);
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith(
      [
        "[server:unexpected] /administracion/academias/:academyId (GET)",
        "TypeError: Cannot read properties of undefined (reading 'name')",
        "1 since the last alert · 2026-10-11T12:00:00.000Z · release a383c3a",
      ].join("\n"),
    );
  });

  test("keeps a repeat within the hour without alerting again", async () => {
    const sendAlert = vi.fn(async () => true);

    await recordUnexpectedError(entry(), { sendAlert });
    await recordUnexpectedError(entry({ at: minutesLater(59) }), {
      sendAlert,
    });

    expect(await db.$count(unexpectedErrors)).toBe(2);
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("alerts again after the hour, counting what it held back", async () => {
    const sendAlert = vi.fn(async (_text: string) => true);

    await recordUnexpectedError(entry(), { sendAlert });
    await recordUnexpectedError(entry({ at: minutesLater(10) }), {
      sendAlert,
    });
    await recordUnexpectedError(entry({ at: minutesLater(61) }), {
      sendAlert,
    });

    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(sendAlert.mock.calls[1][0]).toContain("2 since the last alert");
  });

  test("leaves the alert to the next repeat when it was not delivered", async () => {
    const sendAlert = vi
      .fn(async (_text: string) => true)
      .mockResolvedValueOnce(false);

    await recordUnexpectedError(entry(), { sendAlert });
    await recordUnexpectedError(entry({ at: minutesLater(5) }), {
      sendAlert,
    });

    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(sendAlert.mock.calls[1][0]).toContain("2 since the last alert");
  });

  test("throttles each signature on its own", async () => {
    const sendAlert = vi.fn(async () => true);

    await recordUnexpectedError(entry(), { sendAlert });
    await recordUnexpectedError(entry({ route: "/portal" }), { sendAlert });

    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  test("alerts once for simultaneous repeats", async () => {
    const sendAlert = vi.fn(async () => true);

    await Promise.all(
      [0, 1, 2].map(() => recordUnexpectedError(entry(), { sendAlert })),
    );

    expect(await db.$count(unexpectedErrors)).toBe(3);
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("still alerts, and never throws, when the row cannot be written", async () => {
    vi.spyOn(PgDatabase.prototype, "transaction").mockRejectedValue(
      new Error("connection refused"),
    );
    const sendAlert = vi.fn(async (_text: string) => true);

    await expect(
      recordUnexpectedError(entry(), { sendAlert }),
    ).resolves.toBeUndefined();
    await recordUnexpectedError(entry({ at: minutesLater(5) }), {
      sendAlert,
    });

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("not recorded");
  });

  test("fits an oversized release and stack into the row", async () => {
    await recordUnexpectedError(
      entry({ release: "r".repeat(100), stack: "x".repeat(100_000) }),
      { sendAlert: async () => true },
    );

    const [row] = await db.select().from(unexpectedErrors);
    expect(row.release).toHaveLength(64);
    expect(row.stack.length).toBeLessThan(100_000);
  });
});

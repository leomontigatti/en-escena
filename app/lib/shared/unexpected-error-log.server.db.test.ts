import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "@/db";
import { unexpectedErrors } from "@/db/schema";

import { reportUnexpectedServerError } from "./unexpected-error-log.server";
import { recordUnexpectedError } from "./unexpected-error-store.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SOURCE_COMMIT", "a383c3a4480b9286af5acfdff5290ec1836cfda3");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("keeps a reported server error as a row and alerts on it", async () => {
  const sendAlert = vi.fn(async (_text: string) => true);

  await reportUnexpectedServerError(
    new Error("boom"),
    {
      request: new Request(
        "https://sistema.enescena.com.ar/portal?dni=30123456",
        {
          method: "POST",
        },
      ),
      params: {},
    },
    {
      resolveUserId: async () => "user-123",
      recordError: (entry) => recordUnexpectedError(entry, { sendAlert }),
    },
  );

  const rows = await db.select().from(unexpectedErrors);
  expect(rows).toEqual([
    expect.objectContaining({
      source: "server",
      route: "/portal",
      method: "POST",
      userId: "user-123",
      release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
      stack: expect.stringMatching(/^Error: boom\n {4}at /),
    }),
  ]);
  expect(JSON.stringify(rows)).not.toContain("30123456");
  expect(sendAlert).toHaveBeenCalledTimes(1);
  expect(sendAlert.mock.calls[0][0]).not.toContain("user-123");
});

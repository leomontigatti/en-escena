import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { unexpectedErrors } from "@/db/schema";

import { createClientErrorIntake } from "./client-error-intake.server";

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

const endpoint = "http://sistema.enescena.com.ar/internal/client-error";
const report = {
  route: "/portal/bailarines/:dancerId",
  at: "2026-10-18T22:15:00.000Z",
  stack:
    "TypeError: x is undefined\n    at Dancer (https://sistema.enescena.com.ar/assets/route-DkS2F3a_.js:1:2345)",
};

function intake({ limit = 5, alertsPerHour = 5 } = {}) {
  const sendAlert = vi.fn(async (_text: string) => true);
  const receive = createClientErrorIntake({
    resolveUserId: async () => "user-123",
    sendAlert,
    limit: { requests: limit, windowMs: 60_000 },
    alertsPerHour,
  });

  return { receive, sendAlert };
}

function post({
  body = JSON.stringify(report),
  headers = {},
}: {
  body?: BodyInit;
  headers?: Record<string, string>;
} = {}) {
  return new Request(endpoint, {
    method: "POST",
    body,
    // Node needs it to send a streamed body.
    duplex: "half",
    headers: {
      // TLS ends at the proxy: the request says `http`, the browser `https`.
      origin: "https://sistema.enescena.com.ar",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      ...headers,
    },
  } as RequestInit);
}

describe("createClientErrorIntake", () => {
  test("keeps a browser's report with the server's release and the signed-in user", async () => {
    const { receive, sendAlert } = intake();

    const response = await receive(post());

    expect(response.status).toBe(204);
    expect(await db.select().from(unexpectedErrors)).toEqual([
      expect.objectContaining({
        source: "client",
        route: "/portal/bailarines/:dancerId",
        method: null,
        userId: "user-123",
        release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
        stack: report.stack,
      }),
    ]);
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["another site's origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["no origin", { origin: "" }],
  ])("refuses %s and keeps nothing", async (_label, headers) => {
    const { receive } = intake();

    const response = await receive(post({ headers }));

    expect(response.status).toBe(403);
    expect(await db.$count(unexpectedErrors)).toBe(0);
  });

  test("refuses a body that is not JSON", async () => {
    const { receive } = intake();

    const response = await receive(
      post({ headers: { "content-type": "text/plain" } }),
    );

    expect(response.status).toBe(415);
  });

  test.each([
    ["declares its length", (body: string) => body],
    [
      "streams without a length",
      (body: string) => new Blob([body]).stream() as unknown as BodyInit,
    ],
  ])("refuses a body over 8 KB that %s", async (_label, toBody) => {
    const { receive } = intake();
    const oversized = JSON.stringify({
      ...report,
      stack: "x".repeat(9000),
    });

    const response = await receive(post({ body: toBody(oversized) }));

    expect(response.status).toBe(413);
    expect(await db.$count(unexpectedErrors)).toBe(0);
  });

  test.each([
    ["a field the line does not have", { ...report, params: { id: "7" } }],
    ["a route that is not a pattern", { ...report, route: "portal" }],
    ["no stack", { route: report.route, at: report.at }],
  ])("refuses %s", async (_label, payload) => {
    const { receive } = intake();

    const response = await receive(post({ body: JSON.stringify(payload) }));

    expect(response.status).toBe(400);
    expect(await db.$count(unexpectedErrors)).toBe(0);
  });

  test("refuses an address over its limit, and only that address", async () => {
    const { receive } = intake({ limit: 2 });

    const statuses = [];
    for (let index = 0; index < 3; index += 1) {
      statuses.push((await receive(post())).status);
    }
    const otherAddress = await receive(
      post({ headers: { "cf-connecting-ip": "198.51.100.4" } }),
    );

    expect(statuses).toEqual([204, 204, 429]);
    expect(otherAddress.status).toBe(204);
    expect(await db.$count(unexpectedErrors)).toBe(3);
  });

  test("counts an IPv6 network as one address", async () => {
    const { receive } = intake({ limit: 1 });

    const first = await receive(
      post({ headers: { "cf-connecting-ip": "2001:db8:1:2:aaaa::1" } }),
    );
    const sameNetwork = await receive(
      post({
        headers: { "cf-connecting-ip": "2001:db8:1:2:bbbb:cccc:dddd:2" },
      }),
    );

    expect([first.status, sameNetwork.status]).toEqual([204, 429]);
  });

  test("caps the alerts browser reports can send in an hour, so forged ones cannot bury the chat", async () => {
    const { receive, sendAlert } = intake({ limit: 100, alertsPerHour: 2 });

    for (let index = 0; index < 4; index += 1) {
      const response = await receive(
        post({
          body: JSON.stringify({
            ...report,
            stack: `Error: forged ${"x".repeat(index + 1)}`,
          }),
        }),
      );
      expect(response.status).toBe(204);
    }

    expect(await db.$count(unexpectedErrors)).toBe(4);
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });
});

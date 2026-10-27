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

function intake({
  limit = 5,
  alertsPerHour = 5,
  outageAddresses = 3,
  requestsServed = 0,
} = {}) {
  const sendAlert = vi.fn(async (_text: string) => true);
  const receive = createClientErrorIntake({
    resolveUserId: async () => "user-123",
    sendAlert,
    countRequestsServed: () => requestsServed,
    limit: { requests: limit, windowMs: 60_000 },
    alertsPerHour,
    outage: { addresses: outageAddresses, shareOfRequests: 0.01 },
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

  test.each([
    [
      "Chrome",
      "TypeError: Failed to fetch\n    at ye (https://sistema.enescena.com.ar/assets/errorBoundaries-Dudvcpwz.js:2:7095)",
    ],
    ["Safari", "TypeError: Load failed"],
    [
      "Safari naming the host",
      "TypeError: Load failed (sistema.enescena.com.ar)",
    ],
    ["Firefox", "TypeError: NetworkError when attempting to fetch resource."],
    [
      "a data response cut off mid-body",
      "Error: Unable to decode turbo-stream response\nCaused by: TypeError: Load failed\n    at ye (https://sistema.enescena.com.ar/assets/errorBoundaries-e_1BS-xM.js:2:8006)",
    ],
  ])(
    "keeps a lost connection in %s without alerting, since no code of ours failed",
    async (_browser, stack) => {
      const { receive, sendAlert } = intake();

      const response = await receive(
        post({ body: JSON.stringify({ ...report, stack }) }),
      );

      expect(response.status).toBe(204);
      expect(await db.$count(unexpectedErrors)).toBe(1);
      expect(sendAlert).not.toHaveBeenCalled();
    },
  );

  test("alerts once when lost connections come from enough addresses in an hour to be an outage, not one user's signal", async () => {
    const { receive, sendAlert } = intake({ outageAddresses: 3 });
    const lostConnection = (address: string) =>
      receive(
        post({
          body: JSON.stringify({
            ...report,
            stack: "TypeError: Failed to fetch",
          }),
          headers: { "cf-connecting-ip": address },
        }),
      );

    // One user's flaky signal, however often, is not an outage.
    for (let index = 0; index < 4; index += 1) {
      await lostConnection("203.0.113.7");
    }
    await lostConnection("198.51.100.4");
    expect(sendAlert).not.toHaveBeenCalled();

    await lostConnection("192.0.2.9");
    await lostConnection("192.0.2.10");

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain("3 addresses");
    expect(await db.$count(unexpectedErrors)).toBe(7);
  });

  test("alerts on a bug whose cause is not a lost connection", async () => {
    const { receive, sendAlert } = intake();

    await receive(
      post({
        body: JSON.stringify({
          ...report,
          stack:
            "Error: Unable to decode turbo-stream response\nCaused by: SyntaxError: Unexpected end of JSON input",
        }),
      }),
    );

    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  test("does not call it an outage when the lost connections are a sliver of the traffic served, as a full theatre's phones are", async () => {
    // The `Gran Final` vote of 2026-10-25: about 60 lost connections against
    // some 39,000 requests served in the same 40 minutes, every one answered.
    const { receive, sendAlert } = intake({
      limit: 100,
      outageAddresses: 3,
      requestsServed: 39_000,
    });

    for (let index = 0; index < 60; index += 1) {
      await receive(
        post({
          body: JSON.stringify({ ...report, stack: "TypeError: Load failed" }),
          headers: { "cf-connecting-ip": `192.0.2.${index}` },
        }),
      );
    }

    expect(sendAlert).not.toHaveBeenCalled();
  });

  test("calls it an outage once the lost connections are a real share of the traffic served", async () => {
    const { receive, sendAlert } = intake({
      outageAddresses: 3,
      requestsServed: 300,
    });

    for (const address of ["192.0.2.1", "192.0.2.2", "192.0.2.3"]) {
      await receive(
        post({
          body: JSON.stringify({ ...report, stack: "TypeError: Load failed" }),
          headers: { "cf-connecting-ip": address },
        }),
      );
    }

    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toContain(
      "3 lost connections against 300 requests served",
    );
  });

  test("weighs the lost connections of the last hour, so a burst that crosses the hour is still an outage", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T00:00:00.000Z"));
    const { receive, sendAlert } = intake({
      limit: 100,
      outageAddresses: 3,
      requestsServed: 1_000,
    });
    const lostConnection = (address: string) =>
      receive(
        post({
          body: JSON.stringify({ ...report, stack: "TypeError: Load failed" }),
          headers: { "cf-connecting-ip": address },
        }),
      );

    await lostConnection("192.0.2.200");
    vi.setSystemTime(new Date("2026-10-26T00:59:00.000Z"));
    for (let index = 0; index < 8; index += 1) {
      await lostConnection(`192.0.2.${index}`);
    }
    expect(sendAlert).not.toHaveBeenCalled();

    // Ten in the last hour, one in a hundred of the requests served.
    vi.setSystemTime(new Date("2026-10-26T01:01:00.000Z"));
    await lostConnection("192.0.2.100");
    await lostConnection("192.0.2.101");

    expect(sendAlert).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test("keeps trying the outage alert while it is not delivered, even with the hour's budget spent", async () => {
    const { receive, sendAlert } = intake({
      limit: 100,
      alertsPerHour: 1,
      outageAddresses: 1,
    });
    // Spends the hour's budget for browser reports.
    await receive(post());
    sendAlert.mockClear();
    sendAlert.mockResolvedValueOnce(false);

    for (const address of ["192.0.2.9", "192.0.2.10"]) {
      await receive(
        post({
          body: JSON.stringify({ ...report, stack: "TypeError: Load failed" }),
          headers: { "cf-connecting-ip": address },
        }),
      );
    }

    expect(sendAlert).toHaveBeenCalledTimes(2);
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

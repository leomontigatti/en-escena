import { UNSAFE_ErrorResponseImpl } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { reportUnexpectedClientError } from "./unexpected-error-log";

describe("reportUnexpectedClientError", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let fetchFake: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchFake = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchFake);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T22:15:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("writes one tagged line with route pattern, time and stack", () => {
    const error = new TypeError("Cannot read properties of undefined");

    reportUnexpectedClientError(error, {
      // As React Router hands it over: the routes' relative paths joined.
      pattern: "portal/bailarines/:dancerId",
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [output] = consoleError.mock.calls[0];
    expect(output).not.toContain("\n");
    expect(output).toMatch(/^\[client:unexpected\] /);
    expect(JSON.parse(output.slice("[client:unexpected] ".length))).toEqual({
      route: "/portal/bailarines/:dancerId",
      at: "2026-10-18T22:15:00.000Z",
      stack: error.stack,
    });
  });

  test("sends the same line to the server, which keeps it", () => {
    const error = new TypeError("Cannot read properties of undefined");

    reportUnexpectedClientError(error, { pattern: "portal" });

    expect(fetchFake).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFake.mock.calls[0];
    expect(url).toBe("/internal/client-error");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      route: "/portal",
      at: "2026-10-18T22:15:00.000Z",
      stack: error.stack,
    });
  });

  test("reports an error once when React Router hands it over for each boundary it reached", () => {
    // A navigation whose data request fails rejects every route's loader with
    // the same error, and `onError` runs once per boundary holding it.
    const error = new TypeError("Failed to fetch");

    reportUnexpectedClientError(error, { pattern: "portal" });
    reportUnexpectedClientError(error, { pattern: "portal" });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  test("starts the report with the error's name and message when the browser's stack leaves them out", () => {
    // Firefox and Safari write only the frames, and the server reads the
    // first line to tell a lost connection from a bug.
    const error = new TypeError(
      "NetworkError when attempting to fetch resource.",
    );
    error.stack =
      "singleFetch@https://sistema.enescena.com.ar/assets/errorBoundaries-Dudvcpwz.js:2:7095\n";

    reportUnexpectedClientError(error, { pattern: "portal" });

    const sent = JSON.parse(String(fetchFake.mock.calls[0][1]?.body));
    expect(sent.stack).toBe(
      "TypeError: NetworkError when attempting to fetch resource.\nsingleFetch@https://sistema.enescena.com.ar/assets/errorBoundaries-Dudvcpwz.js:2:7095\n",
    );
  });

  test("names what failed underneath right after the headline, where trimming cannot reach it", () => {
    // React Router wraps the network or parse error a data request hit, and
    // the wrapper's message alone cannot tell a lost connection from a bug.
    const error = new Error("Unable to decode turbo-stream response", {
      cause: new TypeError("Load failed", {
        cause: new Error("stream closed"),
      }),
    });
    error.stack = `Error: Unable to decode turbo-stream response\n${"    at ye (https://sistema.enescena.com.ar/assets/errorBoundaries-e_1BS-xM.js:2:8006)\n".repeat(200)}`;

    reportUnexpectedClientError(error, { pattern: "portal/resultados" });

    const sent = JSON.parse(String(fetchFake.mock.calls[0][1]?.body));
    expect(sent.stack.split("\n").slice(0, 4)).toEqual([
      "Error: Unable to decode turbo-stream response",
      "Caused by: TypeError: Load failed",
      "Caused by: Error: stream closed",
      "    at ye (https://sistema.enescena.com.ar/assets/errorBoundaries-e_1BS-xM.js:2:8006)",
    ]);
  });

  test("trims a long browser stack so the report fits the endpoint's 8 KB", () => {
    const error = new Error("too much recursion");
    error.stack = `InternalError: too much recursion\n${"render@https://sistema.enescena.com.ar/assets/chunk-DkS2F3a_.js:1:23456\n".repeat(200)}`;

    reportUnexpectedClientError(error, { pattern: "portal" });

    const body = String(fetchFake.mock.calls[0][1]?.body);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(8 * 1024);
    expect(JSON.parse(body).stack).toMatch(
      /^InternalError: too much recursion\n/,
    );
  });

  test("stops sending after a page's first few errors, so a render loop cannot flood the server", async () => {
    // A fresh module is a fresh page load.
    vi.resetModules();
    const { reportUnexpectedClientError: reportOnFreshPage } =
      await import("./unexpected-error-log");

    for (let index = 0; index < 50; index += 1) {
      reportOnFreshPage(new Error(`boom ${index}`), {
        pattern: "portal",
      });
    }

    expect(consoleError).toHaveBeenCalledTimes(50);
    expect(fetchFake).toHaveBeenCalledTimes(10);
  });

  test("writes nothing for a refusal the boundary renders", () => {
    reportUnexpectedClientError(
      new UNSAFE_ErrorResponseImpl(403, "Forbidden", "No tenés permiso."),
      { pattern: "administracion" },
    );

    expect(consoleError).not.toHaveBeenCalled();
    expect(fetchFake).not.toHaveBeenCalled();
  });
});

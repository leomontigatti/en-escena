import { UNSAFE_ErrorResponseImpl } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { reportUnexpectedClientError } from "./unexpected-error-log";

describe("reportUnexpectedClientError", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T22:15:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("writes one tagged line with route pattern, time, release and stack", () => {
    const error = new TypeError("Cannot read properties of undefined");

    reportUnexpectedClientError(error, {
      // As React Router hands it over: the routes' relative paths joined.
      pattern: "portal/bailarines/:dancerId",
      release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [output] = consoleError.mock.calls[0];
    expect(output).not.toContain("\n");
    expect(output).toMatch(/^\[client:unexpected\] /);
    expect(JSON.parse(output.slice("[client:unexpected] ".length))).toEqual({
      route: "/portal/bailarines/:dancerId",
      at: "2026-10-18T22:15:00.000Z",
      release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
      stack: error.stack,
    });
  });

  test("writes nothing for a refusal the boundary renders", () => {
    reportUnexpectedClientError(
      new UNSAFE_ErrorResponseImpl(403, "Forbidden", "No tenés permiso."),
      { pattern: "administracion", release: "unknown" },
    );

    expect(consoleError).not.toHaveBeenCalled();
  });
});

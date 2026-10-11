import { describe, expect, test } from "vitest";

import { signUnexpectedError } from "./unexpected-error-signature.server";

const route = "/administracion/academias/:academyId";

function serverStack(message: string, line: number) {
  return [
    `TypeError: ${message}`,
    `    at loader (/app/build/server/index.js:${line}:17)`,
    "    at callRouteHandler (/app/node_modules/react-router/dist/index.js:9:3)",
  ].join("\n");
}

describe("signUnexpectedError", () => {
  test("gives one bug one signature across ids in its message and releases", () => {
    const first = signUnexpectedError({
      source: "server",
      route,
      stack: serverStack(
        "No academy 6f1c2e5a-1b2c-4d3e-8f90-123456789abc in event 12",
        1200,
      ),
    });
    const second = signUnexpectedError({
      source: "server",
      route,
      stack: serverStack(
        "No academy 0a9b8c7d-6e5f-4a3b-9c2d-abcdefabcdef in event 7",
        1340,
      ),
    });

    expect(second).toBe(first);
  });

  test("tells apart a different message, route, source or app frame", () => {
    const base = {
      source: "server" as const,
      route,
      stack: serverStack("boom", 10),
    };
    const signature = signUnexpectedError(base);

    expect(
      signUnexpectedError({ ...base, stack: serverStack("other", 10) }),
    ).not.toBe(signature);
    expect(signUnexpectedError({ ...base, route: "/portal" })).not.toBe(
      signature,
    );
    expect(signUnexpectedError({ ...base, source: "client" })).not.toBe(
      signature,
    );
    expect(
      signUnexpectedError({
        ...base,
        stack: base.stack.replace("at loader", "at action"),
      }),
    ).not.toBe(signature);
  });

  test("reads the top frame outside dependencies, past library frames", () => {
    const viaLibrary = (appFrame: string) =>
      signUnexpectedError({
        source: "server",
        route,
        stack: [
          "Error: boom",
          "    at Object.parse (/app/node_modules/zod/index.js:1:1)",
          "    at node:internal/process/task_queues:105:5",
          `    at ${appFrame} (/app/build/server/index.js:20:3)`,
        ].join("\n"),
      });

    expect(viaLibrary("loader")).not.toBe(viaLibrary("action"));
  });

  test("ignores the bundle hash and origin of a browser frame", () => {
    const clientStack = (origin: string, hash: string) =>
      [
        "TypeError: x is undefined",
        `Component@${origin}/assets/route-${hash}.js:1:2345`,
      ].join("\n");

    expect(
      signUnexpectedError({
        source: "client",
        route,
        stack: clientStack("https://sistema.enescena.com.ar", "DkS2F3a_"),
      }),
    ).toBe(
      signUnexpectedError({
        source: "client",
        route,
        stack: clientStack("https://pruebas.enescena.com.ar", "Zq9-x1Lm"),
      }),
    );
  });
});

import { DrizzleQueryError } from "drizzle-orm";
import {
  createRequestHandler,
  type HandleErrorFunction,
  type ServerBuild,
  UNSAFE_ErrorResponseImpl,
} from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  reportUnexpectedServerError,
  routePatternInstrumentation,
} from "./unexpected-error-log.server";

const signedInUser = async () => "user-123";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SOURCE_COMMIT", "a383c3a4480b9286af5acfdff5290ec1836cfda3");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The one line written, parsed back: it must be a single physical line that
// starts with the tag, so a grep on the tag returns every field.
function loggedLine() {
  expect(consoleError).toHaveBeenCalledTimes(1);
  const [output] = consoleError.mock.calls[0];
  expect(output).toEqual(expect.any(String));
  expect(output).not.toContain("\n");
  expect(output).toMatch(/^\[server:unexpected\] /);

  return JSON.parse(output.slice("[server:unexpected] ".length));
}

describe("handleError behind the route pattern instrumentation", () => {
  // The same wiring as app/entry.server.tsx, run by React Router's own request
  // handler over a two-route build whose leaf loader throws.
  function serve(request: Request) {
    const handleError: HandleErrorFunction = (error, { request, params }) => {
      void reportUnexpectedServerError(
        error,
        { request, params },
        { resolveUserId: signedInUser },
      );
    };
    const build = {
      entry: {
        module: {
          default: () => new Response("<html></html>"),
          handleError,
          instrumentations: [routePatternInstrumentation],
        },
      },
      routes: {
        root: { id: "root", path: "", module: { loader: () => null } },
        academy: {
          id: "academy",
          parentId: "root",
          path: "administracion/academias/:academyId",
          module: {
            loader: () => {
              throw new Error("boom");
            },
            default: () => null,
          },
        },
      },
      assets: { url: "/assets/manifest.js", version: "test", routes: {} },
      publicPath: "/",
      assetsBuildDirectory: "build/client",
      future: {},
      ssr: true,
      isSpaMode: false,
      prerender: [],
      routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
    } as unknown as ServerBuild;

    return createRequestHandler(build, "production")(request);
  }

  test.each([
    ["a plain id", "acad-42", "acad-42"],
    ["an encoded slash", "Ana%252FGomez", "Gomez"],
  ])(
    "writes one line naming the route pattern, never the param value (%s)",
    async (_label, encodedValue, valueFragment) => {
      await serve(
        new Request(
          `https://sistema.enescena.com.ar/administracion/academias/${encodedValue}.data?dni=30123456`,
          { headers: { cookie: "better-auth.session_token=secret-token" } },
        ),
      );

      await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
      const line = loggedLine();

      expect(line).toEqual({
        route: "/administracion/academias/:academyId",
        method: "GET",
        userId: "user-123",
        at: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        release: "a383c3a4480b9286af5acfdff5290ec1836cfda3",
        stack: expect.stringMatching(/^Error: boom\n {4}at /),
      });

      const output = String(consoleError.mock.calls[0][0]);
      expect(output).not.toContain(valueFragment);
      expect(output).not.toContain("30123456");
      expect(output).not.toContain("secret-token");
    },
  );
});

describe("reportUnexpectedServerError", () => {
  const portalRequest = (init?: RequestInit) =>
    new Request("https://sistema.enescena.com.ar/portal", init);

  test.each([
    [
      "a thrown Response",
      new Response("No encontramos esa academia.", { status: 404 }),
    ],
    [
      "a route error response",
      new UNSAFE_ErrorResponseImpl(
        404,
        "Not Found",
        "No encontramos esa academia.",
      ),
    ],
  ])(
    "writes nothing for %s, a refusal the boundary renders",
    async (_label, refusal) => {
      await reportUnexpectedServerError(
        refusal,
        { request: portalRequest(), params: {} },
        { resolveUserId: signedInUser },
      );

      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  test("writes nothing for a request the browser aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await reportUnexpectedServerError(
      new Error("The operation was aborted."),
      { request: portalRequest({ signal: controller.signal }), params: {} },
      { resolveUserId: signedInUser },
    );

    expect(consoleError).not.toHaveBeenCalled();
  });

  test("names a route no loader reached by its path only when it matched no param", async () => {
    await reportUnexpectedServerError(
      new Error("boom"),
      { request: portalRequest(), params: {} },
      { resolveUserId: signedInUser },
    );
    expect(loggedLine().route).toBe("/portal");

    consoleError.mockClear();
    await reportUnexpectedServerError(
      new Error("boom"),
      {
        request: new Request(
          "https://sistema.enescena.com.ar/portal/bailarines/dancer-7",
        ),
        params: { dancerId: "dancer-7" },
      },
      { resolveUserId: signedInUser },
    );
    expect(loggedLine().route).toBe("unknown");
  });

  test("writes the line with no user when the session cannot be read", async () => {
    await reportUnexpectedServerError(
      new Error("boom"),
      { request: portalRequest(), params: {} },
      {
        resolveUserId: async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
        },
      },
    );

    expect(loggedLine()).toMatchObject({ route: "/portal", userId: null });
  });

  test("writes the line with no user when the session lookup does not answer", async () => {
    vi.useFakeTimers();
    const report = reportUnexpectedServerError(
      new Error("boom"),
      { request: portalRequest(), params: {} },
      { resolveUserId: () => new Promise<string | null>(() => {}) },
    );

    await vi.advanceTimersByTimeAsync(1000);
    await report;

    expect(loggedLine()).toMatchObject({ userId: null });
  });

  test("names the release unknown when the deployment does not say", async () => {
    vi.stubEnv("SOURCE_COMMIT", undefined);

    await reportUnexpectedServerError(
      new Error("boom"),
      { request: portalRequest(), params: {} },
      { resolveUserId: signedInUser },
    );

    expect(loggedLine()).toMatchObject({ release: "unknown" });
  });

  test("keeps a failed query's params out of the line", async () => {
    const driverError = Object.assign(
      new Error('duplicate key value violates unique constraint "dancer_dni"'),
      { code: "23505", constraint_name: "dancer_dni" },
    );
    const error = new DrizzleQueryError(
      'insert into "dancer" ("name", "dni") values ($1, $2)',
      ["Ana Gomez", "30123456"],
      driverError,
    );

    await reportUnexpectedServerError(
      error,
      { request: portalRequest({ method: "POST" }), params: {} },
      { resolveUserId: signedInUser },
    );

    expect(loggedLine().stack).toMatch(
      /^Error: Failed query: insert into "dancer" \("name", "dni"\) values \(\$1, \$2\)\nparams: \[redacted\]\ncause: code 23505, constraint dancer_dni\n {4}at /,
    );
    const output = String(consoleError.mock.calls[0][0]);
    expect(output).not.toContain("Ana Gomez");
    expect(output).not.toContain("30123456");
  });
});

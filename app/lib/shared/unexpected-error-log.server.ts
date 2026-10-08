import { AsyncLocalStorage } from "node:async_hooks";

import { DrizzleQueryError } from "drizzle-orm";
import type { Params, ServerInstrumentation } from "react-router";

import { readRelease } from "@/lib/shared/app-environment.server";
import { readErrorProperty } from "@/lib/shared/error-properties.server";
import {
  describeErrorStack,
  isDeliberateRefusal,
  toAbsolutePattern,
} from "@/lib/shared/unexpected-error-log";

type UnexpectedServerErrorDependencies = {
  resolveUserId: (request: Request) => Promise<string | null>;
};

// `handleError` is given the matched params but not the route pattern, and the
// path cannot stand in for it: it holds the param values (ids, names), and no
// rewrite of it is safe, since React Router decodes a value such as `%252F`
// differently from any segment-by-segment comparison. The loader and action
// instrumentations are given React Router's own pattern, so they leave it in
// this per-request scope for `handleError` to read.
const requestScope = new AsyncLocalStorage<{ pattern: string | null }>();

const routePatternInstrumentation: ServerInstrumentation = {
  handler(handler) {
    handler.instrument({
      request: (handleRequest) =>
        requestScope.run({ pattern: null }, async () => {
          await handleRequest();
        }),
    });
  },
  route(route) {
    const recordPattern = async (
      callHandler: () => Promise<unknown>,
      { pattern }: { pattern: string },
    ) => {
      const scope = requestScope.getStore();

      if (scope) {
        scope.pattern = pattern;
      }

      await callHandler();
    };

    route.instrument({ loader: recordPattern, action: recordPattern });
  },
};

/**
 * Writes the one `[server:unexpected]` line for an error React Router hands to
 * `handleError`, as a single JSON line so a grep on the tag returns all of it.
 * The line names the route by its pattern and carries no request data: param
 * values, query string, form body, headers and session stay out, since they
 * hold dancer and payment data (Ley 25.326 minimisation, #987).
 */
async function reportUnexpectedServerError(
  error: unknown,
  { request, params }: { request: Request; params: Params },
  { resolveUserId }: UnexpectedServerErrorDependencies,
): Promise<void> {
  if (request.signal.aborted || isDeliberateRefusal(error)) {
    return;
  }

  // Read before the first `await`, while still inside the request's scope.
  const route = readRoutePattern(request, params);
  const userId = await resolveUserIdWithin(resolveUserId, request);
  const line = {
    route,
    method: request.method,
    userId,
    at: new Date().toISOString(),
    release: readRelease(),
    stack: describeServerError(error),
  };

  console.error(`[server:unexpected] ${JSON.stringify(line)}`);
}

// An error raised before any loader ran (the CSRF check, a failed match) has
// no recorded pattern. Its path is safe to name only when no param was matched
// in it; otherwise the route stays unnamed.
function readRoutePattern(request: Request, params: Params) {
  const pattern = requestScope.getStore()?.pattern;

  if (pattern) {
    return toAbsolutePattern(pattern);
  }

  if (Object.keys(params).length > 0) {
    return "unknown";
  }

  return stripDataSuffix(new URL(request.url).pathname);
}

// A client navigation fetches loader data from `<path>.data`, and the root's
// from `/_root.data`.
function stripDataSuffix(pathname: string) {
  if (pathname === "/_root.data") {
    return "/";
  }

  return pathname.replace(/\.data$/, "");
}

// The session lookup reads the database, which may be the very thing that
// failed: the line must not wait on it, nor be lost to it.
const USER_ID_TIMEOUT_MS = 1000;

async function resolveUserIdWithin(
  resolveUserId: UnexpectedServerErrorDependencies["resolveUserId"],
  request: Request,
): Promise<string | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), USER_ID_TIMEOUT_MS);
  });

  try {
    return await Promise.race([resolveUserId(request), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * The stack of a server error, with a failed query's bound values redacted.
 * Also what a tagged `console.error` carries when a catch converts a failure
 * into user copy, since that failure never reaches `handleError`.
 */
function describeServerError(error: unknown) {
  if (error instanceof DrizzleQueryError) {
    return describeFailedQuery(error);
  }

  return describeErrorStack(error);
}

// Drizzle puts the query's bound values in the message, and so in the stack:
// names, document numbers, emails. The line keeps the SQL and the driver's
// code and constraint, which say what failed, and drops the values. The
// driver's own message is left out too, since some quote the offending value.
function describeFailedQuery(error: DrizzleQueryError) {
  // The frames follow the `name: message` header; cut by its length, since a
  // bound value can hold a line that looks like a frame.
  const stack = error.stack ?? "";
  const header = `${error.name}: ${error.message}`;
  const frames = stack.startsWith(header) ? stack.slice(header.length + 1) : "";
  const cause = [
    `code ${readErrorProperty(error.cause, "code") ?? "unknown"}`,
    ...constraintOf(error.cause),
  ].join(", ");

  return [
    `${error.name}: Failed query: ${error.query}`,
    "params: [redacted]",
    `cause: ${cause}`,
    frames,
  ].join("\n");
}

function constraintOf(cause: unknown) {
  // postgres.js (production) says `constraint_name`, PGlite says `constraint`.
  const constraint =
    readErrorProperty(cause, "constraint_name") ??
    readErrorProperty(cause, "constraint");

  return constraint ? [`constraint ${constraint}`] : [];
}

export {
  describeServerError,
  reportUnexpectedServerError,
  routePatternInstrumentation,
};

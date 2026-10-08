import { isRouteErrorResponse } from "react-router";

/**
 * A thrown `Response`, or the error response React Router builds from one, is
 * a deliberate refusal (a redirect, a 403 or a 404) that the error boundary
 * renders. It is not a failure, so it is never reported.
 */
function isDeliberateRefusal(error: unknown) {
  return error instanceof Response || isRouteErrorResponse(error);
}

// React Router joins the matched routes' relative paths, so its pattern comes
// without the leading slash a path has: `administracion/academias/:academyId`.
function toAbsolutePattern(pattern: string) {
  return pattern.startsWith("/") ? pattern : `/${pattern}`;
}

function describeErrorStack(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  // Anything can be thrown, including a value `String()` cannot print, and
  // the report must not throw while describing it.
  try {
    return String(error);
  } catch {
    return `Thrown ${typeof error} with no string form`;
  }
}

/**
 * Writes the one `[client:unexpected]` line for an error `<HydratedRouter>`
 * hands to `onError`: a loader, action or render failure in the browser. One
 * JSON line, like the server's, kept in the browser console: nothing is sent
 * anywhere.
 */
function reportUnexpectedClientError(
  error: unknown,
  { pattern, release }: { pattern: string; release: string },
) {
  if (isDeliberateRefusal(error)) {
    return;
  }

  // The browser cannot read the session cookie and React Router does not say
  // which request failed, so unlike `[server:unexpected]` the line carries no
  // user id and no method.
  const line = {
    route: toAbsolutePattern(pattern),
    at: new Date().toISOString(),
    release,
    stack: describeErrorStack(error),
  };

  console.error(`[client:unexpected] ${JSON.stringify(line)}`);
}

export {
  describeErrorStack,
  isDeliberateRefusal,
  reportUnexpectedClientError,
  toAbsolutePattern,
};

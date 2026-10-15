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
    const headline = `${error.name}: ${error.message}`;

    if (!error.stack) {
      return headline;
    }

    // V8 opens the stack with the headline; Firefox and Safari write only the
    // frames, and every reader takes the first line for what failed.
    const firstLine = error.stack.split("\n", 1)[0];

    return firstLine.includes(error.message.split("\n", 1)[0] || error.name)
      ? error.stack
      : `${headline}\n${error.stack}`;
  }

  // Anything can be thrown, including a value `String()` cannot print, and
  // the report must not throw while describing it.
  try {
    return String(error);
  } catch {
    return `Thrown ${typeof error} with no string form`;
  }
}

// Enough to see what broke on a page; a render loop past it would only flood
// the endpoint, whose own per-address limit would refuse it anyway.
const MAX_SENT_PER_PAGE = 10;
// The endpoint refuses a body over 8 KB, and Firefox and Safari keep every
// frame of a deep stack where V8 stops at ten: the top of it is what names
// the bug.
const MAX_SENT_STACK_LENGTH = 6000;
let sentOnThisPage = 0;
// A navigation whose data request fails rejects every route's loader with the
// one error, and React Router calls `onError` once per boundary that holds it.
const reportedOnThisPage = new WeakSet<object>();

/**
 * Writes the one `[client:unexpected]` line for an error `<HydratedRouter>`
 * hands to `onError`: a loader, action or render failure in the browser. One
 * JSON line, like the server's, in the browser console, and the same fields
 * sent to `/internal/client-error`, which keeps them with the release and the
 * user stamped by the server.
 */
function reportUnexpectedClientError(
  error: unknown,
  { pattern }: { pattern: string },
) {
  if (isDeliberateRefusal(error)) {
    return;
  }

  if (typeof error === "object" && error !== null) {
    if (reportedOnThisPage.has(error)) {
      return;
    }

    reportedOnThisPage.add(error);
  }

  // The browser cannot read the session cookie and React Router does not say
  // which request failed, so unlike `[server:unexpected]` the line carries no
  // user id and no method. Nor the release: the page does not publish it.
  const line = {
    route: toAbsolutePattern(pattern),
    at: new Date().toISOString(),
    stack: describeErrorStack(error),
  };

  console.error(`[client:unexpected] ${JSON.stringify(line)}`);

  if (sentOnThisPage >= MAX_SENT_PER_PAGE) {
    return;
  }

  sentOnThisPage += 1;
  // `keepalive` lets the report outlive a navigation away from the page.
  // A failed send is dropped: the line above is already in the console, and
  // reporting the report's failure could loop.
  fetch("/internal/client-error", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...line,
      stack: line.stack.slice(0, MAX_SENT_STACK_LENGTH),
    }),
  }).catch(() => {});
}

export {
  describeErrorStack,
  isDeliberateRefusal,
  reportUnexpectedClientError,
  toAbsolutePattern,
};

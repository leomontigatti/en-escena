import { PassThrough } from "node:stream";

import type {
  AppLoadContext,
  EntryContext,
  HandleErrorFunction,
} from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import {
  reportUnexpectedServerError,
  routePatternInstrumentation,
} from "@/lib/shared/unexpected-error-log.server";

export const streamTimeout = 5_000;

// Records each request's route pattern for `handleError`, which is not given it.
export const instrumentations = [routePatternInstrumentation];

export const handleError: HandleErrorFunction = (
  error,
  { request, params },
) => {
  // `void` because the report settles on its own: it catches the session
  // lookup's failure and bounds its wait, so the promise never rejects.
  void reportUnexpectedServerError(
    error,
    { request, params },
    {
      resolveUserId: async (signedInRequest) =>
        (await accessAuthProvider.getAccessSession(signedInRequest))?.user.id ??
        null,
    },
  );
};

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and memory leak
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Report streaming rendering errors from inside the shell, through
          // the same tagged line as every other unexpected error. Don't report
          // errors encountered during initial shell rendering since they'll
          // reject and reach `handleError` from handleDocumentRequest.
          if (shellRendered) {
            handleError(error, {
              request,
              params:
                routerContext.staticHandlerContext.matches[0]?.params ?? {},
              context: loadContext,
            });
          }
        },
      },
    );
  });
}

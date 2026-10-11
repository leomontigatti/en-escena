import { RouterContextProvider } from "react-router";

import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import { createFormData } from "@/lib/test-support/form-data";

/** The arguments React Router hands an admin route's loader or action. */
export function routeArgs<Params extends Record<string, string>>(
  request: Request,
  pattern: string,
  params = {} as Params,
) {
  return {
    request,
    params,
    context: new RouterContextProvider(),
    url: readRequestedUrl(request),
    pattern,
  };
}

/** A form post carrying the cookie of a request `createSignedInRequest` built. */
export function createPostRequest(
  url: string,
  cookie: string,
  values: Record<string, string>,
) {
  return new Request(url, {
    method: "POST",
    body: createFormData(values),
    headers: { cookie },
  });
}

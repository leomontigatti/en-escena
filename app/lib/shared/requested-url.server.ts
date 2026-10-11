/**
 * The URL the reader asked for. React Router hands loaders and actions the raw
 * HTTP request, so on a client navigation or a submit `request.url` is the data
 * request: a `.data` suffix on the path and the `_routes` and `index` params it
 * adds. This strips them the way React Router does for the `url` argument it
 * passes beside the request, for the guards and server modules that take the
 * request alone.
 */
export function readRequestedUrl(request: Request): URL {
  const url = new URL(request.url);

  url.pathname = stripDataSuffix(url.pathname);
  url.searchParams.delete("_routes");

  // A submit to an index route marks it with a bare `index`; a value is the
  // reader's own.
  const indexValues = url.searchParams.getAll("index").filter(Boolean);
  url.searchParams.delete("index");
  for (const value of indexValues) {
    url.searchParams.append("index", value);
  }

  return url;
}

// The root's data is fetched from `/_root.data`; every other route's from
// `<path>.data`.
function stripDataSuffix(pathname: string) {
  if (pathname === "/_root.data") {
    return "/";
  }

  return pathname.replace(/\.data$/, "");
}

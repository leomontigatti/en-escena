import {
  createRequestHandler,
  type LoaderFunctionArgs,
  type ServerBuild,
} from "react-router";
import { beforeEach, describe, expect, test } from "vitest";

import config from "../../../react-router.config";
import { readRequestedUrl } from "./requested-url.server";

const origin = "https://sistema.enescena.com.ar";

let seen: { ours: string; theirs: string }[];

beforeEach(() => {
  seen = [];
});

// Each handler records both readings of the URL it was called for: ours from the
// raw request, and React Router's own normalized `url` argument.
function record({ request, url }: LoaderFunctionArgs) {
  seen.push({ ours: readRequestedUrl(request).href, theirs: url.href });

  return null;
}

// React Router's own request handler, under this repo's `future` config, over a
// root, an index route with an action and a list route.
function serve(request: Request) {
  const build = {
    entry: { module: { default: () => new Response("<html></html>") } },
    routes: {
      root: { id: "root", path: "", module: { loader: record } },
      home: {
        id: "home",
        parentId: "root",
        index: true,
        module: { loader: record, action: record, default: () => null },
      },
      academies: {
        id: "academies",
        parentId: "root",
        path: "administracion/academias",
        module: { loader: record, default: () => null },
      },
    },
    assets: { url: "/assets/manifest.js", version: "test", routes: {} },
    publicPath: "/",
    assetsBuildDirectory: "build/client",
    future: config.future,
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
  } as unknown as ServerBuild;

  return createRequestHandler(build, "production")(request);
}

const rootDataPath = config.future?.v8_trailingSlashAwareDataRequests
  ? "/_.data"
  : "/_root.data";

describe("readRequestedUrl", () => {
  test.each([
    ["a document request", "/administracion/academias?pagina=2"],
    ["a data request", "/administracion/academias.data?pagina=2"],
    [
      "a data request for some routes",
      "/administracion/academias.data?pagina=2&_routes=root%2Cacademies",
    ],
    ["the root's data request", `${rootDataPath}?evento=1`],
    [
      "a data request for a path with a trailing slash",
      "/administracion/academias/_.data?pagina=2",
    ],
  ])(
    "reads the URL React Router hands the loaders, not the wire's (%s)",
    async (_label, path) => {
      await serve(new Request(`${origin}${path}`));

      expect(seen.length).toBeGreaterThan(0);
      for (const { ours, theirs } of seen) {
        expect(ours).toBe(theirs);
        expect(ours).not.toMatch(/\.data|_routes/);
      }
    },
  );

  test("drops the index marker of a submit to an index route", async () => {
    await serve(
      new Request(`${origin}${rootDataPath}?index&evento=1`, {
        method: "POST",
      }),
    );

    expect(seen[0]).toEqual({
      ours: `${origin}/?evento=1`,
      theirs: `${origin}/?evento=1`,
    });
  });
});

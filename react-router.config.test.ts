import { createRequestHandler, type ServerBuild } from "react-router";
import { describe, expect, test } from "vitest";

import config from "./react-router.config";

const productionHost = "sistema.enescena.com.ar";

/**
 * The smallest server build that reaches `singleFetchAction`, carrying the
 * `allowedActionOrigins` the real build embeds verbatim from the config.
 */
function buildWithConfiguredOrigins(): ServerBuild {
  return {
    entry: {
      module: {
        default: () => new Response(null),
      },
    },
    routes: {
      root: {
        id: "root",
        path: "",
        module: { default: () => null },
      },
      "routes/ingresar": {
        id: "routes/ingresar",
        parentId: "root",
        path: "ingresar",
        module: {
          default: () => null,
          action: () => ({ ok: true }),
        },
      },
    },
    assets: {
      entry: { imports: [], module: "" },
      routes: {},
      url: "",
      version: "",
    },
    publicPath: "/",
    assetsBuildDirectory: "",
    basename: "/",
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
    allowedActionOrigins: config.allowedActionOrigins,
  } as unknown as ServerBuild;
}

describe("action origin check behind the TLS-terminating proxy", () => {
  test("accepts a same-site https submit that reaches the app as http", async () => {
    const handler = createRequestHandler(
      buildWithConfiguredOrigins(),
      "production",
    );

    // `@react-router/express` builds the URL from `req.protocol`, which is
    // `http` because Cloudflare and Traefik terminate TLS and `react-router-serve`
    // does not enable `trust proxy`. The browser still sends its https origin.
    const response = await handler(
      new Request(`http://${productionHost}/ingresar.data`, {
        method: "POST",
        headers: {
          origin: `https://${productionHost}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      }),
    );

    expect(response.status).not.toBe(400);
  });

  test("still rejects a submit from a foreign origin", async () => {
    const handler = createRequestHandler(
      buildWithConfiguredOrigins(),
      "production",
    );

    const response = await handler(
      new Request(`http://${productionHost}/ingresar.data`, {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      }),
    );

    expect(response.status).toBe(400);
  });
});

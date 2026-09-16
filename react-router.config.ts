import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // TLS ends at Cloudflare and Traefik, so the app builds request URLs as
  // `http://` while the browser's `Origin` is `https://`. Since 7.18 the action
  // CSRF check compares the scheme too and rejects every submit with a 400
  // unless the host is allowed here. See react-router.config.test.ts.
  allowedActionOrigins: ["sistema.enescena.com.ar"],
  future: {
    v8_middleware: false,
    v8_splitRouteModules: false,
    v8_viteEnvironmentApi: false,
    v8_passThroughRequests: false,
    v8_trailingSlashAwareDataRequests: false,
  },
} satisfies Config;

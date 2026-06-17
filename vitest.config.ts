import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig as any,
  defineConfig({
    resolve: {
      alias: {
        "@opentelemetry/semantic-conventions": fileURLToPath(
          new URL(
            "./tests/stubs/opentelemetry-semantic-conventions.ts",
            import.meta.url,
          ),
        ),
        "@better-auth/core/dist/instrumentation/attributes.mjs": fileURLToPath(
          new URL(
            "./tests/stubs/better-auth-instrumentation-attributes.ts",
            import.meta.url,
          ),
        ),
      },
    },
    test: {
      server: {
        deps: {
          inline: [
            /@better-auth\/core/,
            /@opentelemetry\/semantic-conventions/,
          ],
        },
      },
      exclude: [
        ...configDefaults.exclude,
        "**/*.db.test.ts",
        "**/.sandcastle/**",
      ],
    },
  }),
);

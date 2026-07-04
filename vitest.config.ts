import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig as UserConfig,
  defineConfig({
    resolve: {
      alias: {
        "@opentelemetry/semantic-conventions": fileURLToPath(
          new URL(
            "./tests/stubs/opentelemetry-semantic-conventions.ts",
            import.meta.url,
          ),
        ),
      },
    },
    test: {
      setupFiles: ["./tests/setup/react-test-env.ts"],
      server: {
        deps: {
          inline: [/@opentelemetry\/semantic-conventions/],
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

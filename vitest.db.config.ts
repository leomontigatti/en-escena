import { fileURLToPath } from "node:url";

import { mergeConfig } from "vitest/config";
import { defineConfig } from "vitest/config";

import viteConfig from "./vite.config";

const semanticConventionsStub = fileURLToPath(
  new URL(
    "./tests/stubs/opentelemetry-semantic-conventions.ts",
    import.meta.url,
  ),
);

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@opentelemetry\/semantic-conventions$/,
          replacement: semanticConventionsStub,
        },
      ],
    },
    test: {
      deps: {
        fallbackCJS: true,
        inline: true,
      },
      fileParallelism: false,
      include: ["**/*.db.test.ts"],
      maxConcurrency: 1,
      maxWorkers: 1,
      minWorkers: 1,
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
      setupFiles: ["./tests/db/setup.ts"],
      sequence: {
        concurrent: false,
      },
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }),
);

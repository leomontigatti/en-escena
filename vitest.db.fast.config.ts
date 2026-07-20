import { fileURLToPath } from "node:url";

import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";

import viteConfig from "./vite.config";

const semanticConventionsStub = fileURLToPath(
  new URL(
    "./tests/stubs/opentelemetry-semantic-conventions.ts",
    import.meta.url,
  ),
);
const standardWebhooksStub = fileURLToPath(
  new URL("./tests/stubs/standardwebhooks.ts", import.meta.url),
);
const fastDatabaseModule = fileURLToPath(
  new URL("./tests/db/fast-db.ts", import.meta.url),
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
        {
          find: /^standardwebhooks$/,
          replacement: standardWebhooksStub,
        },
        {
          find: /^@\/db$/,
          replacement: fastDatabaseModule,
        },
      ],
    },
    test: {
      exclude: [
        ...configDefaults.exclude,
        "**/.sandcastle/**",
        "**/.claude/worktrees/**",
      ],
      fileParallelism: true,
      include: ["**/*.db.test.ts"],
      maxConcurrency: 1,
      maxWorkers: "50%",
      minWorkers: 1,
      setupFiles: ["./tests/db/setup-fast.ts"],
      sequence: {
        concurrent: false,
      },
      server: {
        deps: {
          fallbackCJS: true,
          inline: true,
        },
      },
      deps: {
        optimizer: {
          ssr: {
            enabled: true,
            include: [
              "@aws-sdk/client-s3",
              "@aws-sdk/s3-request-presigner",
              "@aws-sdk/checksums",
            ],
          },
        },
      },
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }),
);

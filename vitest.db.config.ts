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
      ],
    },
    test: {
      exclude: [
        ...configDefaults.exclude,
        "**/.sandcastle/**",
        "**/.claude/worktrees/**",
      ],
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
      server: {
        deps: {
          fallbackCJS: true,
          inline: true,
        },
      },
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }),
);

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
          // `inline: true` pushed every dependency through Vite for each of the
          // 112 files; the three patterns `vitest.config.ts` inlines are the
          // ones that actually need it (see the comment there). Halved this
          // suite's `collect` phase (issue #961).
          inline: [
            /@opentelemetry\/semantic-conventions/,
            /(^|\/)better-auth/,
            /@better-auth\//,
          ],
        },
      },
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }),
);

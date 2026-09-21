import { fileURLToPath } from "node:url";

import type { UserConfig } from "vite";

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
  viteConfig as UserConfig,
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
      // Vitest 5 dropped `minWorkers`; this path wants the workers anyway, so
      // there is nothing to replace it with (see `vitest.db.config.ts` for the
      // serial path, which is the one the removal mattered to).
      maxWorkers: "50%",
      setupFiles: ["./tests/db/setup-fast.ts"],
      sequence: {
        // As in `vitest.db.config.ts`: load-bearing since Vitest 5 removed
        // `describe.sequential`. Each file still owns its database here, but
        // the tests inside one must not overlap.
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

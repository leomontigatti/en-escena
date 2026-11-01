import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { UserConfig } from "vite";

import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";

import {
  asGlob,
  findModuleSwappingFiles,
} from "./tests/setup/module-swapping-files";
import { testReporters } from "./tests/setup/test-reporters";
import viteConfig from "./vite.config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const testExclude = [...configDefaults.exclude, "**/.claude/worktrees/**"];
const isolatedFiles = findModuleSwappingFiles(
  rootDir,
  globSync("**/*.db.test.ts", { cwd: rootDir, exclude: testExclude }),
);

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
      reporters: testReporters,
      exclude: testExclude,
      fileParallelism: true,
      maxConcurrency: 1,
      // Agent threads share this laptop's memory. Two workers took 186 s and
      // 3.3 GB where four took 167 s and 5.7 GB.
      maxWorkers: 2,
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
      projects: [
        {
          extends: true,
          test: {
            name: "db-isolated",
            include: isolatedFiles.map(asGlob),
          },
        },
        {
          extends: true,
          test: {
            name: "db-shared",
            include: ["**/*.db.test.ts"],
            // `extends: true` appends this to the root `exclude`.
            exclude: isolatedFiles.map(asGlob),
            isolate: false,
          },
        },
      ],
    },
  }),
);

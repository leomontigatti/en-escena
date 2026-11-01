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
      ],
    },
    test: {
      reporters: testReporters,
      exclude: testExclude,
      fileParallelism: false,
      maxConcurrency: 1,
      // Vitest 5 dropped `minWorkers` and `poolOptions`; `fileParallelism:
      // false` plus `maxWorkers: 1` is what keeps the suite serial within a
      // runner — every file shares one database (see
      // `docs/adr/0007-db-test-isolation-model.md`).
      maxWorkers: 1,
      setupFiles: ["./tests/db/setup.ts"],
      sequence: {
        // Vitest 5 removed `describe.sequential`/`test.sequential`, so this is
        // now the only thing keeping the tests *within* a file ordered. It was
        // already the repo's setting — do not drop it as a redundant default.
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

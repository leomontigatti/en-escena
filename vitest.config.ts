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
          // `better-auth` arrastra `@opentelemetry/semantic-conventions`, cuyo
          // `build/esm/index.js` hace `export * from './trace'` (directory-import
          // que el loader ESM nativo de Node no resuelve). Si `better-auth` queda
          // externo, Node lo carga nativo y su import de semantic-conventions
          // esquiva el alias/stub → "Directory import ... is not supported".
          // Inlinándolo, Vite procesa la cadena y el alias del stub aplica.
          // (`vitest.db.fast.config.ts` no falla porque usa `inline: true`.)
          inline: [
            /@opentelemetry\/semantic-conventions/,
            /(^|\/)better-auth/,
            /@better-auth\//,
          ],
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
      exclude: [
        ...configDefaults.exclude,
        "**/*.db.test.ts",
        "**/.sandcastle/**",
        "**/.claude/worktrees/**",
      ],
    },
  }),
);

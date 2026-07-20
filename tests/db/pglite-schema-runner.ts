import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const migratePgliteSchemaScriptPath = fileURLToPath(
  new URL("./migrate-pglite-schema.ts", import.meta.url),
);
const pushPgliteSchemaScriptPath = fileURLToPath(
  new URL("./push-pglite-schema.ts", import.meta.url),
);

export function runPgliteSchemaMigrate(dataDir: string) {
  runPgliteSchemaScript(migratePgliteSchemaScriptPath, dataDir);
}

// Oráculo del test de equivalencia: aplica el schema con `pushSchema`. Vive en
// un subproceso para no cargar `drizzle-kit/api` en un worker de vitest.
export function runPgliteSchemaPush(dataDir: string) {
  runPgliteSchemaScript(pushPgliteSchemaScriptPath, dataDir);
}

function runPgliteSchemaScript(scriptPath: string, dataDir: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", scriptPath, dataDir],
    {
      env: process.env,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to apply the PGlite schema.");
  }
}

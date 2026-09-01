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

// The oracle of the equivalence test: it applies the schema with `pushSchema`. It
// lives in a subprocess so `drizzle-kit/api` is not loaded into a vitest worker.
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

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pushPgliteSchemaScriptPath = fileURLToPath(
  new URL("./push-pglite-schema.ts", import.meta.url),
);

export function runPgliteSchemaPush(dataDir: string) {
  const schemaPushResult = spawnSync(
    process.execPath,
    ["--import", "tsx", pushPgliteSchemaScriptPath, dataDir],
    {
      env: process.env,
      encoding: "utf8",
    },
  );

  if (schemaPushResult.error) {
    throw schemaPushResult.error;
  }

  if (schemaPushResult.status !== 0) {
    throw new Error(
      schemaPushResult.stderr || "Failed to apply the PGlite schema.",
    );
  }
}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const snapshotStateKey = Symbol.for("en-escena.db-test.pglite-snapshot");
const snapshotCacheDirectory = path.join(
  tmpdir(),
  "en-escena-pglite-snapshots",
);
const pushPgliteSchemaScriptPath = fileURLToPath(
  new URL("./push-pglite-schema.ts", import.meta.url),
);
const snapshotInputs = [
  new URL("../../app/db/schema.ts", import.meta.url),
  new URL("./pglite-schema.ts", import.meta.url),
  new URL("./push-pglite-schema.ts", import.meta.url),
];

type SnapshotState = {
  snapshotPromise?: Promise<Blob>;
};

export async function loadPgliteSchemaSnapshot() {
  const state = getSnapshotState();
  state.snapshotPromise ??= createSnapshotBlob();
  return state.snapshotPromise;
}

function getSnapshotState() {
  const globalState = globalThis as typeof globalThis & {
    [snapshotStateKey]?: SnapshotState;
  };

  globalState[snapshotStateKey] ??= {};
  return globalState[snapshotStateKey];
}

async function createSnapshotBlob() {
  const snapshotKey = await buildSnapshotKey();
  const snapshotPath = path.join(snapshotCacheDirectory, `${snapshotKey}.tar`);

  await mkdir(snapshotCacheDirectory, { recursive: true });

  try {
    const snapshotBytes = await readFile(snapshotPath);

    return new Blob([snapshotBytes]);
  } catch {
    await buildSnapshotArchive(snapshotPath);

    const snapshotBytes = await readFile(snapshotPath);
    return new Blob([snapshotBytes]);
  }
}

async function buildSnapshotKey() {
  const hash = createHash("sha256");

  for (const snapshotInput of snapshotInputs) {
    hash.update(await readFile(snapshotInput));
  }

  return hash.digest("hex").slice(0, 16);
}

async function buildSnapshotArchive(snapshotPath: string) {
  const dataDir = await mkdtemp(`${tmpdir()}/en-escena-pglite-schema-`);

  try {
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

    const client = new PGlite(dataDir);

    try {
      const snapshot = await client.dumpDataDir("none");
      const snapshotBytes = Buffer.from(await snapshot.arrayBuffer());

      await writeFile(snapshotPath, snapshotBytes);
    } finally {
      await client.close();
    }
  } finally {
    await rm(dataDir, { force: true, recursive: true });
  }
}

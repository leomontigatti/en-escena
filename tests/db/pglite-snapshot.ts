import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import { runPgliteSchemaMigrate } from "./pglite-schema-runner";

const snapshotStateKey = Symbol.for("en-escena.db-test.pglite-snapshot");
const snapshotCacheDirectory = path.join(
  tmpdir(),
  "en-escena-pglite-snapshots",
);
// El schema se aplica ahora vía `migrate` sobre app/db/migrations, así que la
// cache-key del snapshot cuelga de la carpeta de migraciones (todos sus
// archivos) más los scripts que la aplican. Regenerar/agregar una migración
// invalida el snapshot; editar solo el schema TS sin generar migración, no.
const migrationsDirectory = fileURLToPath(
  new URL("../../app/db/migrations", import.meta.url),
);
const snapshotScriptInputs = [
  new URL("./pglite-schema.ts", import.meta.url),
  new URL("./pglite-schema-runner.ts", import.meta.url),
  new URL("./migrate-pglite-schema.ts", import.meta.url),
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

  for (const migrationFile of await listMigrationFiles()) {
    hash.update(migrationFile.relativePath);
    hash.update(await readFile(migrationFile.absolutePath));
  }

  for (const scriptInput of snapshotScriptInputs) {
    hash.update(await readFile(scriptInput));
  }

  return hash.digest("hex").slice(0, 16);
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDirectory, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = path.join(entry.parentPath, entry.name);

      return {
        absolutePath,
        relativePath: path.relative(migrationsDirectory, absolutePath),
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function buildSnapshotArchive(snapshotPath: string) {
  const dataDir = await mkdtemp(
    path.join(tmpdir(), "en-escena-pglite-schema-"),
  );
  const temporarySnapshotPath = `${snapshotPath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    runPgliteSchemaMigrate(dataDir);
    const client = new PGlite(dataDir);

    try {
      const snapshot = await client.dumpDataDir("none");
      const snapshotBytes = Buffer.from(await snapshot.arrayBuffer());

      await writeFile(temporarySnapshotPath, snapshotBytes);
      await rename(temporarySnapshotPath, snapshotPath);
    } finally {
      await client.close();
    }
  } finally {
    await rm(temporarySnapshotPath, { force: true });
    await rm(dataDir, { force: true, recursive: true });
  }
}

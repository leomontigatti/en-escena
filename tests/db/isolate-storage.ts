import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

// Gives each test file a storage directory of its own and removes it when the
// file is done. A hard assignment, not `??=`: Vitest loads the `.env`, whose
// `STORAGE_VOLUME_DIR` is the main checkout's local storage, which every
// worktree's `.env` links to, and every file a test uploaded used to stay
// there (#1687). Only the
// path is reserved: the storage adapter creates the directory on its first
// write, so a file that never writes, or whose tests are all skipped (and so
// never reaches `afterAll`), leaves nothing behind.
//
// Called from both DB setups (`setup.ts` and `setup-fast.ts`). A function, not
// an effect of importing this module: with `isolate: false` a worker evaluates
// the module once, while a setup file runs again for each test file.
export function isolateStorage() {
  const storageVolumeDir = join(
    tmpdir(),
    `en-escena-test-storage-${randomUUID()}`,
  );

  process.env.STORAGE_VOLUME_DIR = storageVolumeDir;

  afterAll(() => {
    rmSync(storageVolumeDir, { force: true, recursive: true });
  });
}

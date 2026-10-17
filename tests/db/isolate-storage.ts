import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

// Gives each test file a storage directory of its own and removes it when the
// file is done. A hard assignment, not `??=`: Vitest loads the `.env`, whose
// `STORAGE_VOLUME_DIR` is the developer's local storage, shared by every
// worktree, and every file a test uploaded used to stay there (#1687). Only the
// path is reserved: the storage adapter creates the directory on its first
// write, so a file that never writes, or whose tests are all skipped (and so
// never reaches `afterAll`), leaves nothing behind.
//
// Imported by both DB setups (`setup.ts` and `setup-fast.ts`); the effect
// happens on module import.
const storageVolumeDir = join(
  tmpdir(),
  `en-escena-test-storage-${randomUUID()}`,
);

process.env.STORAGE_VOLUME_DIR = storageVolumeDir;

afterAll(() => {
  rmSync(storageVolumeDir, { force: true, recursive: true });
});

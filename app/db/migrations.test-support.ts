import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const migrationsFolder = fileURLToPath(
  new URL("./migrations", import.meta.url),
);

/**
 * A migrations folder truncated up to — and not including — `tag`, so a test can
 * migrate a database to the state a migration expects, seed the shape it acts
 * on, and then run the real migration against it. The journal decides what runs,
 * so filtering its entries and copying the surviving `.sql` files is enough.
 */
export async function createMigrationsFolderBefore(tag: string) {
  const folder = await mkdtemp(path.join(tmpdir(), "en-escena-migrations-"));
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };

  const entries = journal.entries.slice(
    0,
    journal.entries.findIndex((entry) => entry.tag === tag),
  );

  await cp(path.join(migrationsFolder, "meta"), path.join(folder, "meta"), {
    recursive: true,
  });
  await writeFile(
    path.join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    await cp(
      path.join(migrationsFolder, `${entry.tag}.sql`),
      path.join(folder, `${entry.tag}.sql`),
    );
  }

  return folder;
}

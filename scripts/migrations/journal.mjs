import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Pure reasoning about the Drizzle migration journal, shared by the container
 * entrypoint (scripts/migrate.mjs) and the CI ordering check
 * (scripts/check-migration-order.mjs).
 *
 * Both checks exist because `drizzle-orm` tracks applied migrations with a
 * high-water mark rather than set membership: `pg-core/dialect.js` reads
 * `order by created_at desc limit 1` and then applies every migration whose
 * `when` is greater. A migration merged with an older timestamp than one
 * already applied is therefore skipped permanently, and silently.
 *
 * @typedef {{ idx: number; tag: string; when: number }} JournalEntry
 * @typedef {JournalEntry & { hash: string }} HashedJournalEntry
 * @typedef {{ hash: string; createdAt: number }} AppliedMigration
 * @typedef {{ tag: string; when: number; reason: "not-applied" | "hash-mismatch" }} JournalInconsistency
 */

/**
 * @param {string} journalContents
 * @returns {JournalEntry[]}
 */
export function parseJournalEntries(journalContents) {
  const journal = /** @type {{ entries?: JournalEntry[] }} */ (
    JSON.parse(journalContents)
  );

  return journal.entries ?? [];
}

/**
 * Hashes each entry the way `drizzle-orm`'s `readMigrationFiles` does: sha256
 * over the raw `.sql` contents. The hash and `when` pair is the identity a
 * migration carries into `drizzle.__drizzle_migrations`.
 *
 * @param {string} migrationsFolder
 * @returns {HashedJournalEntry[]}
 */
export function readHashedJournalEntries(migrationsFolder) {
  const entries = parseJournalEntries(
    readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
  );

  return entries.map((entry) => {
    const migrationSql = readFileSync(
      `${migrationsFolder}/${entry.tag}.sql`,
      "utf8",
    );

    return {
      ...entry,
      hash: createHash("sha256").update(migrationSql).digest("hex"),
    };
  });
}

/**
 * Every journal entry at or below the applied watermark must have a matching
 * row, on both hash and timestamp. An entry below the watermark with no row was
 * skipped by the watermark rule and never will be applied; a matching timestamp
 * with a different hash means the `.sql` file was edited after being applied,
 * which nothing else detects because Drizzle writes the hash but never reads it
 * back.
 *
 * Entries above the watermark are simply pending, which is the normal case.
 *
 * @param {{ entries: HashedJournalEntry[]; appliedMigrations: AppliedMigration[] }} input
 * @returns {JournalInconsistency[]}
 */
export function findJournalInconsistencies({ entries, appliedMigrations }) {
  if (appliedMigrations.length === 0) {
    return [];
  }

  const watermark = Math.max(
    ...appliedMigrations.map((migration) => migration.createdAt),
  );
  const hashByCreatedAt = new Map(
    appliedMigrations.map((migration) => [migration.createdAt, migration.hash]),
  );

  /** @type {JournalInconsistency[]} */
  const inconsistencies = [];

  for (const entry of entries) {
    if (entry.when > watermark) {
      continue;
    }

    const appliedHash = hashByCreatedAt.get(entry.when);

    if (appliedHash === undefined) {
      inconsistencies.push({
        tag: entry.tag,
        when: entry.when,
        reason: "not-applied",
      });
      continue;
    }

    if (appliedHash !== entry.hash) {
      inconsistencies.push({
        tag: entry.tag,
        when: entry.when,
        reason: "hash-mismatch",
      });
    }
  }

  return inconsistencies;
}

/**
 * The same hazard caught one step earlier, in review: a branch whose new
 * migrations carry timestamps older than the newest migration already on the
 * base branch. Merging it would produce a migration that never applies to
 * production, while CI stays green because CI builds a fresh database where
 * everything applies in folder order.
 *
 * @param {{ baseEntries: JournalEntry[]; headEntries: JournalEntry[] }} input
 * @returns {JournalEntry[]}
 */
export function findOutOfOrderEntries({ baseEntries, headEntries }) {
  if (baseEntries.length === 0) {
    return [];
  }

  const baseWatermark = Math.max(...baseEntries.map((entry) => entry.when));
  const baseTimestamps = new Set(baseEntries.map((entry) => entry.when));

  return headEntries.filter(
    (entry) => !baseTimestamps.has(entry.when) && entry.when <= baseWatermark,
  );
}

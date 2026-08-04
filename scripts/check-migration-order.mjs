import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  findOutOfOrderEntries,
  parseJournalEntries,
} from "./migrations/journal.mjs";

/**
 * Fails a branch whose new migrations carry timestamps older than the newest
 * migration already on the base branch.
 *
 * `db-gate` cannot catch this: CI builds a fresh database where every migration
 * applies in folder order. The hazard is an interaction between the file set
 * and the *existing* production journal, which CI does not have. Caught here,
 * the fix is a trivial regenerate; caught at deploy, it is a migration that
 * silently never runs.
 *
 * Usage: node scripts/check-migration-order.mjs [base-ref]
 */

const journalPath = "app/db/migrations/meta/_journal.json";
const baseRef = process.argv[2] ?? "origin/master";

function readBaseEntries() {
  const result = spawnSync("git", ["show", `${baseRef}:${journalPath}`], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.log(
      `No migration journal on ${baseRef}; nothing to compare against.`,
    );
    return [];
  }

  return parseJournalEntries(result.stdout);
}

const headEntries = parseJournalEntries(
  readFileSync(
    fileURLToPath(new URL(`../${journalPath}`, import.meta.url)),
    "utf8",
  ),
);
const outOfOrderEntries = findOutOfOrderEntries({
  baseEntries: readBaseEntries(),
  headEntries,
});

if (outOfOrderEntries.length > 0) {
  for (const entry of outOfOrderEntries) {
    console.error(
      `::error::${entry.tag} (when=${entry.when}) is older than a migration already on ${baseRef}. ` +
        `Drizzle applies migrations by high-water mark, so this one would never run in production. ` +
        `Rebase on ${baseRef} and regenerate it with pnpm db:generate.`,
    );
  }

  process.exit(1);
}

console.log(`Migration order is consistent with ${baseRef}.`);

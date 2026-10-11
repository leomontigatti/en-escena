import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { expect, test } from "vitest";

import { db } from "@/db";
import { unexpectedErrors } from "@/db/schema";

import { installDatabaseTestHooks } from "../tests/db/harness";

installDatabaseTestHooks();

// The statement scripts/unexpected-error-maintenance.sh runs with `psql -f`.
const retention = readFileSync(
  new URL("./unexpected-error-retention.sql", import.meta.url),
  "utf8",
);

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

test("deletes the unexpected errors older than 90 days and keeps the rest", async () => {
  await db.insert(unexpectedErrors).values(
    [
      ["expired", daysAgo(91)],
      ["about-to-expire", daysAgo(89)],
      ["recent", daysAgo(0)],
    ].map(([id, createdAt]) => ({
      id: id as string,
      source: "server" as const,
      signature: "a".repeat(64),
      route: "/portal",
      release: "unknown",
      stack: "Error: boom",
      createdAt: createdAt as Date,
    })),
  );

  await db.execute(sql.raw(retention));

  const kept = await db
    .select({ id: unexpectedErrors.id })
    .from(unexpectedErrors);
  expect(kept.map(({ id }) => id).sort()).toEqual([
    "about-to-expire",
    "recent",
  ]);
});

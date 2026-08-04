import { describe, expect, it } from "vitest";

import {
  findJournalInconsistencies,
  findOutOfOrderEntries,
} from "./journal.mjs";

function journalEntry(idx: number, when: number) {
  return { idx, tag: `000${idx}_migration`, when, hash: `hash-${idx}` };
}

describe("findJournalInconsistencies", () => {
  it("accepts a journal whose applied entries all match", () => {
    const entries = [journalEntry(0, 100), journalEntry(1, 200)];

    expect(
      findJournalInconsistencies({
        entries,
        appliedMigrations: [
          { hash: "hash-0", createdAt: 100 },
          { hash: "hash-1", createdAt: 200 },
        ],
      }),
    ).toEqual([]);
  });

  it("accepts a database Drizzle has never migrated", () => {
    expect(
      findJournalInconsistencies({
        entries: [journalEntry(0, 100)],
        appliedMigrations: [],
      }),
    ).toEqual([]);
  });

  it("ignores entries above the watermark, which are simply pending", () => {
    expect(
      findJournalInconsistencies({
        entries: [journalEntry(0, 100), journalEntry(1, 200)],
        appliedMigrations: [{ hash: "hash-0", createdAt: 100 }],
      }),
    ).toEqual([]);
  });

  it("reports a migration the watermark rule skipped for good", () => {
    // The classic out-of-order merge: 0001 landed after 0002 was applied, so
    // Drizzle's high-water mark has already moved past it.
    expect(
      findJournalInconsistencies({
        entries: [
          journalEntry(0, 100),
          journalEntry(1, 150),
          journalEntry(2, 200),
        ],
        appliedMigrations: [
          { hash: "hash-0", createdAt: 100 },
          { hash: "hash-2", createdAt: 200 },
        ],
      }),
    ).toEqual([{ tag: "0001_migration", when: 150, reason: "not-applied" }]);
  });

  it("reports a migration file edited after it was applied", () => {
    expect(
      findJournalInconsistencies({
        entries: [journalEntry(0, 100)],
        appliedMigrations: [
          { hash: "hash-from-before-the-edit", createdAt: 100 },
        ],
      }),
    ).toEqual([{ tag: "0000_migration", when: 100, reason: "hash-mismatch" }]);
  });
});

describe("findOutOfOrderEntries", () => {
  it("accepts a branch whose new migration postdates the base branch", () => {
    expect(
      findOutOfOrderEntries({
        baseEntries: [journalEntry(0, 100), journalEntry(1, 200)],
        headEntries: [
          journalEntry(0, 100),
          journalEntry(1, 200),
          journalEntry(2, 300),
        ],
      }),
    ).toEqual([]);
  });

  it("rejects a branch whose new migration predates the base branch", () => {
    const staleEntry = journalEntry(2, 150);

    expect(
      findOutOfOrderEntries({
        baseEntries: [journalEntry(0, 100), journalEntry(1, 200)],
        headEntries: [journalEntry(0, 100), journalEntry(1, 200), staleEntry],
      }),
    ).toEqual([staleEntry]);
  });

  it("accepts any branch when the base has no migrations yet", () => {
    expect(
      findOutOfOrderEntries({
        baseEntries: [],
        headEntries: [journalEntry(0, 100)],
      }),
    ).toEqual([]);
  });
});

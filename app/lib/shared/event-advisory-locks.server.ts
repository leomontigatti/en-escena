import { sql } from "drizzle-orm";

import { db } from "@/db";

// A transaction in practice: the lock is released at once outside one.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The event-scoped advisory locks, one keyspace each. They take the two-key
 * form of the advisory lock, a keyspace of its own: the single-key locks (the
 * pool, the comprobante anchors) hash a string into one `bigint`, and a hash
 * collision with one of them would wait on an unrelated lock, which a
 * withdrawal holding its anchor lock turns into a deadlock. The first key says
 * which lock this is, the second hashes the event id: two events hashing alike
 * only share a lock. Nothing else takes the two-key form.
 */
const eventLockSpaces = {
  seminarPriceList: 1,
  choreographyPriceList: 2,
} as const;

export type EventLockSpace = keyof typeof eventLockSpaces;

/**
 * Takes one of the event's advisory locks, shared or exclusive, until the
 * transaction ends: the readers of a list take it shared, so they never wait
 * on each other, and its editor takes it exclusive.
 */
export async function lockEvent(
  executor: Executor,
  input: {
    eventId: string;
    mode: "shared" | "exclusive";
    space: EventLockSpace;
  },
) {
  const space = eventLockSpaces[input.space];

  await executor.execute(
    input.mode === "shared"
      ? sql`select pg_advisory_xact_lock_shared(${space}::int, hashtext(${input.eventId}))`
      : sql`select pg_advisory_xact_lock(${space}::int, hashtext(${input.eventId}))`,
  );
}

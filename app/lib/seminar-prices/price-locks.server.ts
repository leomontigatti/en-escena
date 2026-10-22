import { sql } from "drizzle-orm";

import { db } from "@/db";

// A transaction in practice: the lock is released at once outside one.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The two-key form of the advisory lock is a keyspace of its own: the
 * single-key locks (the pool, the comprobante anchors) hash a string into one
 * `bigint`, and a hash collision with one of them would wait on an unrelated
 * lock, which a withdrawal holding its anchor lock turns into a deadlock. The
 * first key says which lock this is; nothing else takes the two-key form.
 */
const seminarPriceListLockSpace = 1;

/**
 * The lock on an event's seminar price list, taken **shared** by a money write
 * before it reads the list to store a row on an inscription (the allocation
 * dialog, the `Pagar seña` / `Pagar saldo` presets). The price editor takes it
 * exclusive (`lockEventSeminarPricesForEdit`), so whichever comes second sees
 * what the first committed: an edit finds the row stored and refuses, and a
 * write charges by the edited list.
 *
 * The list rather than its rows, because a row created while a write is in
 * flight is one the write can pick up, and nothing exists yet to lock on it.
 * Shared because the writes only read the list: two charges in the same event
 * do not wait on each other here.
 *
 * Taken after the seminar locks (and a preset's inscription locks) and before
 * the pool lock; the editor takes no lock before this one and waits on none
 * after it, so it adds no order to deadlock against. Transaction-scoped, like
 * the pool lock (`allocation-pool.server.ts`). Two events hashing alike only
 * share a lock.
 */
export async function lockEventSeminarPrices(
  executor: Executor,
  eventId: string,
) {
  await executor.execute(
    sql`select pg_advisory_xact_lock_shared(${seminarPriceListLockSpace}::int, hashtext(${eventId}))`,
  );
}

/** `lockEventSeminarPrices`, exclusive: what creating, editing or deleting a
 * seminar price takes before its guards read anything. */
export async function lockEventSeminarPricesForEdit(
  executor: Executor,
  eventId: string,
) {
  await executor.execute(
    sql`select pg_advisory_xact_lock(${seminarPriceListLockSpace}::int, hashtext(${eventId}))`,
  );
}

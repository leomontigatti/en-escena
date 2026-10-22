import { sql } from "drizzle-orm";

import { client, db } from "@/db";

import type { ComprobanteAnchor } from "./anchor";

/**
 * `db` or an open transaction. Every read the emission crosses takes one, so
 * that the whole derivation runs inside the transaction that holds the anchor's
 * lock instead of opening a second connection outside it.
 */
export type ComprobanteExecutor =
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The lock key of one unit. A choreography is its own unit; a seminar's unit is
 * the `(seminar, academy)` pair, so both ids are in the key and two academies
 * emitting in the same seminar never wait on each other.
 */
export function comprobanteAnchorLockKey(anchor: ComprobanteAnchor): string {
  return anchor.kind === "choreography"
    ? `comprobante:choreography:${anchor.choreographyId}`
    : `comprobante:seminar:${anchor.seminarId}:${anchor.academyId}`;
}

/**
 * Runs `run` holding the unit's lock as a **session** lock, on a connection
 * reserved for it, so that nothing else has to stay inside a transaction while
 * ARCA answers (ADR-0014 §7). Emission takes it: its writes commit one by one —
 * the reservation before `FECAESolicitar`, the comprobante after — and the lock
 * has to span all of them and the round-trip between.
 *
 * It fails fast, `pg_try_advisory_lock`, and answers `locked: false` when the
 * unit is busy. Waiting would be wrong here, not just slow: a waiter would hold
 * its reserved connection for as long as the holder talks to ARCA, while the
 * holder still needs a pooled connection for its own reads and writes, so
 * enough waiters on one unit would starve the pool and the holder with it —
 * a deadlock Postgres cannot see.
 *
 * The session and the transaction locks share one key space, so the roster
 * writes that take `lockComprobanteAnchor` wait on an emission in flight, and an
 * emission arriving while one of them holds the lock is turned away. If the
 * unlock itself fails the connection is the likely casualty, and the lock ends
 * with its session.
 */
export async function withComprobanteAnchorLock<T>(
  anchor: ComprobanteAnchor,
  run: () => Promise<T>,
): Promise<{ locked: true; value: T } | { locked: false }> {
  const key = comprobanteAnchorLockKey(anchor);
  const session = await client.reserve();

  try {
    const [row] = await session.unsafe<Array<{ locked: boolean }>>(
      "select pg_try_advisory_lock(hashtext($1)) as locked",
      [key],
    );

    if (!row?.locked) {
      return { locked: false };
    }

    try {
      return { locked: true, value: await run() };
    } finally {
      await session.unsafe("select pg_advisory_unlock(hashtext($1))", [key]);
    }
  } finally {
    session.release();
  }
}

/**
 * Serialises emission per unit. What is emitted is `derived total −
 * documented`, a read-then-write over rows the reader does not lock: two
 * emissions running at once would each see the same delta and each authorize a
 * comprobante for it, and ARCA would hold two fiscal documents for one amount.
 * It also keeps the crediting ceiling honest: the check runs against the notes
 * as they stand while the lock is held.
 *
 * This is the transaction-scoped form, for the roster writes that must not
 * move what an emission in flight is about to document: it is released by the
 * commit or the rollback and never by a caller that forgot. Emission itself
 * holds the session form, `withComprobanteAnchorLock`.
 *
 * `hashtext` collapses the key into the `bigint` the lock function takes. A
 * collision between two different units costs one of them a wait, and never
 * correctness.
 */
export async function lockComprobanteAnchor(
  executor: ComprobanteExecutor,
  anchor: ComprobanteAnchor,
): Promise<void> {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${comprobanteAnchorLockKey(anchor)}))`,
  );
}

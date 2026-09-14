import { sql } from "drizzle-orm";

import { db } from "@/db";

import type { ComprobanteAnchor } from "./anchor";

/**
 * `db` or an open transaction. Every read the emission crosses takes one, so
 * that the whole derivation runs inside the transaction that holds the anchor's
 * lock instead of opening a second connection outside it.
 */
export type ComprobanteExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

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
 * Serialises emission per unit. What is billed is `collected − already billed`,
 * a read-then-write over rows the reader does not lock: two emissions running
 * at once would each see the same unbilled delta and each authorize a
 * comprobante for it, and ARCA would hold two fiscal documents for one amount.
 *
 * The lock is transaction-scoped, so it is released by the commit or the
 * rollback and never by a caller that forgot. It must therefore be taken inside
 * the same transaction that reads the delta and inserts the comprobante — which
 * is why the emission runs in one transaction even though ARCA is called from
 * inside it.
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

import { db } from "@/db";

/**
 * `db` or an open transaction: every caller asks under the lock it already
 * holds on the seminar row, so the answer cannot move under the decision it
 * feeds.
 */
export type SeminarInscriptionExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether any inscription of the seminar has **covered its deposit**: the sum
 * of its allocations reaches the deposit of its stored price row, on a row that
 * was not withdrawn. Covering the deposit is what takes a place in the quota,
 * and it is what freezes the seminar's `kind` and `requiredDepositPercentage`
 * (docs/domain/seminars.md, "The seminar").
 *
 * A seminar inscription holds no money yet: neither the allocation target nor
 * the seminar price list exists (PRD #906, slice 2). Until they do this is the
 * one place that says so, always `false`, so the guards and the read-only look
 * that read it are written once and turn on by wiring this body alone.
 */
export async function hasCoveredSeminarInscription(
  _seminarId: string,
  _executor: SeminarInscriptionExecutor = db,
): Promise<boolean> {
  return false;
}

import { db } from "@/db";
import { lockEvent } from "@/lib/shared/event-advisory-locks.server";

// A transaction in practice: the lock is released at once outside one.
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The lock on an event's seminar price list, taken **shared** by a money write
 * before it reads the list to store a row on an inscription (the allocation
 * dialog, the `Pagar seña` / `Pagar saldo` presets), and by a registration
 * before it reads whether the list covers every participant cell
 * (`registerSeminarInscription`). The price editor takes it exclusive
 * (`lockEventSeminarPricesForEdit`), so whichever comes second sees what the
 * first committed: an edit finds the row stored, or an active inscription in
 * the cell it would uncover, and refuses; a write charges by the edited list;
 * a registration refuses an uncovered one.
 *
 * The list rather than its rows, because a row created while a write is in
 * flight is one the write can pick up, and nothing exists yet to lock on it.
 * Shared because the writes only read the list: two charges or registrations
 * in the same event do not wait on each other here.
 *
 * Taken after the seminar locks (and a preset's inscription locks) and before
 * the pool lock; the editor takes no lock before this one and waits on none
 * after it, so it adds no order to deadlock against. Transaction-scoped, like
 * the pool lock (`allocation-pool.server.ts`), in its own keyspace
 * (`lockEvent`).
 */
export async function lockEventSeminarPrices(
  executor: Executor,
  eventId: string,
) {
  await lockEvent(executor, {
    eventId,
    mode: "shared",
    space: "seminarPriceList",
  });
}

/** `lockEventSeminarPrices`, exclusive: what creating, editing or deleting a
 * seminar price takes before its guards read anything. */
export async function lockEventSeminarPricesForEdit(
  executor: Executor,
  eventId: string,
) {
  await lockEvent(executor, {
    eventId,
    mode: "exclusive",
    space: "seminarPriceList",
  });
}

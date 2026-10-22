import { db } from "@/db";
import { lockEvent } from "@/lib/shared/event-advisory-locks.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The lock on an event's choreography price list, taken **shared** by a write
 * that makes a choreography inscription active (the portal's registration, the
 * administration's draft save). Editing or deleting a price takes it exclusive
 * (`lockEventPricesForEdit`) before its guards ask whether a group type has an
 * active inscription, so whichever comes second sees what the first committed:
 * the edit finds the inscription and refuses to uncover its group type, and a
 * registration finds the group type uncovered (`coversGroupType`, in
 * `repository.server.ts`) and refuses.
 *
 * Taken first in the writer's transaction, before the schedule lock: a price
 * edit that changes the schedules a price covers writes rows that point at the
 * schedule, so it waits on a writer holding that schedule, and that writer
 * must not be waiting on the edit. The editor holds no other lock before this
 * one. Shared, so two writers never wait on each other here.
 */
export async function lockEventPrices(tx: Transaction, eventId: string) {
  await lockEvent(tx, {
    eventId,
    mode: "shared",
    space: "choreographyPriceList",
  });
}

/** `lockEventPrices`, exclusive: what editing or deleting a price takes before
 * its guards read anything. */
export async function lockEventPricesForEdit(tx: Transaction, eventId: string) {
  await lockEvent(tx, {
    eventId,
    mode: "exclusive",
    space: "choreographyPriceList",
  });
}

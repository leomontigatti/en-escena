import { sql } from "drizzle-orm";

import { db } from "@/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The backend a transaction runs on, for `waitForABackendBlockedBy`. */
export async function readBackendPid(tx: Transaction) {
  const [row] = await tx.execute<{ pid: number }>(
    sql`select pg_backend_pid() as pid`,
  );

  return Number(row?.pid);
}

/**
 * Resolves once some other backend waits on a lock the holder's backend has
 * taken: the moment a contention test lets the holder commit, knowing the
 * contender is already queued behind it rather than not started yet. Postgres
 * only; see `isPgliteTestBackend`.
 */
export async function waitForABackendBlockedBy(
  holderPid: number,
  waitingOn: string,
) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await db.execute<{ blocked: number }>(
      sql`select count(*)::int as blocked from pg_stat_activity where ${holderPid} = any(pg_blocking_pids(pid))`,
    );

    if (Number(row?.blocked ?? 0) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`The contender never waited on the ${waitingOn}.`);
}

/**
 * Opens a transaction, runs `hold` in it, starts `contender`, and once the
 * contender waits on what `hold` locked runs `beforeCommit` and commits. Resolves
 * with what the contender answered after the commit: the side under test, run
 * as the one that came second.
 */
export async function runBehindAHolder<T>(input: {
  waitingOn: string;
  hold: (tx: Transaction) => Promise<unknown>;
  contender: () => Promise<T>;
  beforeCommit?: (tx: Transaction) => Promise<unknown>;
}): Promise<T> {
  const held = await db.transaction(async (tx) => {
    await input.hold(tx);

    const queued = input.contender();

    await waitForABackendBlockedBy(await readBackendPid(tx), input.waitingOn);
    await input.beforeCommit?.(tx);

    // Wrapped, so the transaction commits instead of awaiting the contender
    // queued behind it.
    return { queued };
  });

  return await held.queued;
}

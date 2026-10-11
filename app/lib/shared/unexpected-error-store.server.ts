import { and, count, eq, gt, max, sql } from "drizzle-orm";

import { db } from "@/db";
import { unexpectedErrors } from "@/db/schema";
import type { SendOpsAlert } from "@/lib/shared/ops-alert.server";
import { describeErrorStack } from "@/lib/shared/unexpected-error-log";
import {
  readHeadline,
  signUnexpectedError,
} from "@/lib/shared/unexpected-error-signature.server";
import type { UnexpectedErrorSource } from "@/lib/shared/unexpected-error-signature.server";

type UnexpectedErrorEntry = {
  source: UnexpectedErrorSource;
  route: string;
  method: string | null;
  userId: string | null;
  at: Date;
  release: string;
  stack: string;
};

type AlertClaim = { id: string; sinceLastAlert: number };

// One message per bug per hour: enough to know it is happening, too few to
// bury the chat when a dependency is down and every request fails alike.
const ALERT_INTERVAL_MS = 60 * 60 * 1000;
// The row is written from the error path; a database that is the failure
// must not hold the report open. The server-side timeout is shorter, so
// Postgres cancels the transaction before this report gives up on it.
const RECORD_TIMEOUT_MS = 3000;
const STATEMENT_TIMEOUT = "2s";
const MAX_STACK_LENGTH = 16_000;
const MAX_ROUTE_LENGTH = 500;
const MAX_HEADLINE_LENGTH = 300;

/**
 * Keeps an unexpected error as a row of `unexpected_error` and, the first time
 * its signature shows up in an hour, sends one alert. It never throws and it
 * is bounded: it runs on the error path, so its own failure is logged and, if
 * the row could not be written, alerted from memory instead.
 */
async function recordUnexpectedError(
  entry: UnexpectedErrorEntry,
  { sendAlert }: { sendAlert: SendOpsAlert },
): Promise<void> {
  const row = {
    ...entry,
    route: entry.route.slice(0, MAX_ROUTE_LENGTH),
    release: entry.release.slice(0, 64),
    stack: entry.stack.slice(0, MAX_STACK_LENGTH),
  };
  const signature = signUnexpectedError(row);
  const deadline = Date.now() + RECORD_TIMEOUT_MS;
  const recording = insertClaimingAlert(row, signature, deadline);

  let claim: AlertClaim | null;

  try {
    claim = await withinTimeout(recording, RECORD_TIMEOUT_MS);
  } catch (thrown) {
    console.error("[unexpected-error:not-recorded]", {
      error: describeErrorStack(thrown).split("\n")[0],
    });
    // A transaction this report stopped waiting for may still commit a claim
    // it will never send; release it then, or it would silence the hour.
    void recording.then(releaseAlertClaim, () => {});

    if (claimAlertInMemory(signature, row.at)) {
      await sendAlert(
        formatAlert(row, "not recorded: the row could not be written"),
      );
    }

    return;
  }

  if (!claim) {
    return;
  }

  const delivered = await sendAlert(
    formatAlert(row, `${claim.sinceLastAlert} since the last alert`),
  );

  // An undelivered alert leaves the claim to the next repeat.
  if (!delivered) {
    await releaseAlertClaim(claim);
  }
}

// Simultaneous repeats of one bug, the usual shape of an outage, claim a
// single alert between them: the one that takes the per-signature lock
// decides, and the others, rather than wait for it, are written unclaimed.
async function insertClaimingAlert(
  row: UnexpectedErrorEntry,
  signature: string,
  deadline: number,
): Promise<AlertClaim | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`),
    );

    // Waiting for a pool connection counts against the deadline too: a
    // report that has already given up writes nothing.
    if (Date.now() > deadline) {
      throw new Error("Recording the unexpected error started too late");
    }

    const [{ locked }] = await tx
      .select({
        locked: sql<boolean>`pg_try_advisory_xact_lock(hashtext(${`unexpected-error:${signature}`}))`,
      })
      .from(sql`(values (1)) as one`);
    const [{ lastAlertedAt }] = await tx
      .select({ lastAlertedAt: max(unexpectedErrors.alertedAt) })
      .from(unexpectedErrors)
      .where(eq(unexpectedErrors.signature, signature));
    const alerting =
      locked &&
      (lastAlertedAt === null ||
        row.at.getTime() - lastAlertedAt.getTime() >= ALERT_INTERVAL_MS);
    const id = crypto.randomUUID();

    await tx.insert(unexpectedErrors).values({
      id,
      source: row.source,
      signature,
      route: row.route,
      method: row.method,
      userId: row.userId,
      release: row.release,
      stack: row.stack,
      alertedAt: alerting ? row.at : null,
      createdAt: row.at,
    });

    if (!alerting) {
      return null;
    }

    // The rows held back since the last alert, this one included.
    const [{ sinceLastAlert }] = await tx
      .select({ sinceLastAlert: count() })
      .from(unexpectedErrors)
      .where(
        and(
          eq(unexpectedErrors.signature, signature),
          lastAlertedAt === null
            ? undefined
            : gt(unexpectedErrors.createdAt, lastAlertedAt),
        ),
      );

    return { id, sinceLastAlert };
  });
}

async function releaseAlertClaim(claim: AlertClaim | null) {
  if (!claim) {
    return;
  }

  try {
    await withinTimeout(
      db
        .update(unexpectedErrors)
        .set({ alertedAt: null })
        .where(eq(unexpectedErrors.id, claim.id)),
      RECORD_TIMEOUT_MS,
    );
  } catch (thrown) {
    // The claim then holds for its hour: one missed alert, not a failure
    // of the request this report belongs to.
    console.error("[unexpected-error:claim-not-released]", {
      id: claim.id,
      error: describeErrorStack(thrown).split("\n")[0],
    });
  }
}

async function withinTimeout<T>(
  work: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Recording the unexpected error timed out")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// The fallback throttle when the database cannot say what was alerted: it
// lives in this process, so a restart may repeat one alert, which beats
// staying silent while the database is down.
const alertedInMemory = new Map<string, number>();

function claimAlertInMemory(signature: string, at: Date) {
  const now = at.getTime();

  for (const [knownSignature, alertedAt] of alertedInMemory) {
    if (now - alertedAt >= ALERT_INTERVAL_MS) {
      alertedInMemory.delete(knownSignature);
    }
  }

  if (alertedInMemory.has(signature)) {
    return false;
  }

  alertedInMemory.set(signature, now);
  return true;
}

// An ops message, so English. Never the user id or anything from the
// request: the route pattern, the error's headline and when.
function formatAlert(row: UnexpectedErrorEntry, tally: string) {
  const method = row.method ? ` (${row.method})` : "";

  return [
    `[${row.source}:unexpected] ${row.route}${method}`,
    readHeadline(row.stack).slice(0, MAX_HEADLINE_LENGTH),
    `${tally} · ${row.at.toISOString()} · release ${row.release.slice(0, 7)}`,
  ].join("\n");
}

export { recordUnexpectedError };
export type { UnexpectedErrorEntry };

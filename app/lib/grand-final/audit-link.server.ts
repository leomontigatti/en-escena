import { createHash, createHmac } from "node:crypto";

import {
  and,
  asc,
  count,
  eq,
  gt,
  isNull,
  notExists,
  sql,
  type AnyColumn,
} from "drizzle-orm";

import { db } from "@/db";
import { auditLinks, votingRounds } from "@/db/schema";
import { lockEvent } from "@/lib/grand-final/result.server";

/**
 * The `Gran final`'s `auditLink`s: what administration hands to the
 * audience's auditors so they can watch the open round's totals. A link is a
 * bearer secret, so only its hash is stored: the token is derived from the
 * link's id with a key of the server's (`secret`), which lets administration
 * show it again whenever an auditor needs it, on whatever device, until it is
 * revoked or its round closes. A link reads totals and nothing else: it casts
 * no vote and opens no other page.
 */

/** The audience's auditors: three people on stage, never more at once. */
export const maxActiveAuditLinks = 3;

export type AuditLinkRow = {
  createdAt: Date;
  id: string;
  label: string;
  openedAt: Date | null;
  revokedAt: Date | null;
};

export type CreateAuditLinkResult =
  | { id: string; ok: true; token: string }
  | { ok: false; reason: "limit-reached" };

/**
 * The rounds that spend a link issued at `issuedAt`: a link dies with the
 * round open when it was issued, or else the next one to open, so any round
 * of its event closed after that moment is its own.
 */
export function roundsClosedSince(
  eventId: AnyColumn | string,
  issuedAt: AnyColumn | Date,
) {
  return db
    .select({ id: votingRounds.id })
    .from(votingRounds)
    .where(
      and(
        eq(votingRounds.eventId, eventId),
        gt(votingRounds.closedAt, issuedAt),
      ),
    );
}

/**
 * Issues a link for the named auditor, or refuses one past the live limit:
 * links neither revoked nor spent by their round's close.
 * The event row is locked for the count, so two links created at once never
 * both take the last place.
 */
export async function createAuditLink(input: {
  eventId: string;
  label: string;
  secret: string;
}): Promise<CreateAuditLinkResult> {
  return await db.transaction(async (tx) => {
    await lockEvent(tx, input.eventId);
    const [live] = await tx
      .select({ count: count() })
      .from(auditLinks)
      .where(
        and(
          eq(auditLinks.eventId, input.eventId),
          isNull(auditLinks.revokedAt),
          notExists(
            roundsClosedSince(auditLinks.eventId, auditLinks.createdAt),
          ),
        ),
      );

    if ((live?.count ?? 0) >= maxActiveAuditLinks) {
      return { ok: false, reason: "limit-reached" };
    }

    const id = crypto.randomUUID();
    const token = deriveAuditLinkToken(input.secret, id);
    await tx.insert(auditLinks).values({
      eventId: input.eventId,
      id,
      label: input.label,
      tokenHash: hashSecret(token),
    });

    return { id, ok: true, token };
  });
}

/** The event's links, the first created first, revoked ones included. */
export async function listAuditLinks(eventId: string): Promise<AuditLinkRow[]> {
  return await db
    .select({
      createdAt: auditLinks.createdAt,
      id: auditLinks.id,
      label: auditLinks.label,
      openedAt: auditLinks.openedAt,
      revokedAt: auditLinks.revokedAt,
    })
    .from(auditLinks)
    .where(eq(auditLinks.eventId, eventId))
    .orderBy(asc(auditLinks.createdAt), asc(auditLinks.id));
}

export type RevokeAuditLinkResult =
  | { label: string; ok: true }
  | { ok: false; reason: "already-revoked" | "not-found" };

/**
 * Revokes the link for good, opened or not. One conditional update, so a link
 * revoked twice at once keeps the first time and the second reads as already
 * revoked.
 */
export async function revokeAuditLink(input: {
  eventId: string;
  linkId: string;
}): Promise<RevokeAuditLinkResult> {
  const inEvent = and(
    eq(auditLinks.id, input.linkId),
    eq(auditLinks.eventId, input.eventId),
  );
  const [revoked] = await db
    .update(auditLinks)
    .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(inEvent, isNull(auditLinks.revokedAt)))
    .returning({ label: auditLinks.label });

  if (revoked) {
    return { label: revoked.label, ok: true };
  }

  const [existing] = await db
    .select({ id: auditLinks.id })
    .from(auditLinks)
    .where(inEvent);

  return { ok: false, reason: existing ? "already-revoked" : "not-found" };
}

export type ReadAuditLinkHandoverResult =
  | { issuedAt: Date; label: string; ok: true; token: string }
  | { ok: false; reason: "key-changed" | "not-found" | "revoked" };

/**
 * The token of one of the event's live links, derived again, for
 * administration to hand the link over once more. A token that no longer
 * matches the stored hash, because the server's key changed since the link
 * was created, is never handed over: it would open nothing.
 */
export async function readAuditLinkHandover(input: {
  eventId: string;
  linkId: string;
  secret: string;
}): Promise<ReadAuditLinkHandoverResult> {
  const [link] = await db
    .select({
      issuedAt: auditLinks.createdAt,
      label: auditLinks.label,
      revokedAt: auditLinks.revokedAt,
      tokenHash: auditLinks.tokenHash,
    })
    .from(auditLinks)
    .where(
      and(
        eq(auditLinks.id, input.linkId),
        eq(auditLinks.eventId, input.eventId),
      ),
    );

  if (!link) {
    return { ok: false, reason: "not-found" };
  }

  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }

  const token = deriveAuditLinkToken(input.secret, input.linkId);

  if (hashSecret(token) !== link.tokenHash) {
    return { ok: false, reason: "key-changed" };
  }

  return { issuedAt: link.issuedAt, label: link.label, ok: true, token };
}

export type AuditLinkRefusal = "revoked" | "unknown";

export type OpenAuditLinkResult =
  { ok: false; reason: AuditLinkRefusal } | { ok: true };

/**
 * Opens the link the token names, on any device and as often as asked, while
 * it is not revoked. The first open notes when, for the list.
 */
export async function openAuditLink(
  token: string,
): Promise<OpenAuditLinkResult> {
  const tokenHash = hashSecret(token);
  const [link] = await db
    .select({ revokedAt: auditLinks.revokedAt })
    .from(auditLinks)
    .where(eq(auditLinks.tokenHash, tokenHash));

  if (!link) {
    return { ok: false, reason: "unknown" };
  }

  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }

  await db
    .update(auditLinks)
    .set({ openedAt: sql`CURRENT_TIMESTAMP` })
    .where(
      and(eq(auditLinks.tokenHash, tokenHash), isNull(auditLinks.openedAt)),
    );

  return { ok: true };
}

/**
 * What a link audits: its event, and when it was issued, which names its
 * round (`readAuditTotals`).
 */
export type AuditedLink = { eventId: string; issuedAt: Date };

export type AuditSession =
  ({ ok: true } & AuditedLink) | { ok: false; reason: AuditLinkRefusal };

/**
 * The link a browser's token audits, read on every request so a revocation
 * takes effect on the next reload.
 */
export async function readAuditSession(token: string): Promise<AuditSession> {
  const [link] = await db
    .select({
      eventId: auditLinks.eventId,
      issuedAt: auditLinks.createdAt,
      revokedAt: auditLinks.revokedAt,
    })
    .from(auditLinks)
    .where(eq(auditLinks.tokenHash, hashSecret(token)));

  if (!link) {
    return { ok: false, reason: "unknown" };
  }

  return link.revokedAt
    ? { ok: false, reason: "revoked" }
    : { eventId: link.eventId, issuedAt: link.issuedAt, ok: true };
}

/**
 * 128 bits of an HMAC of the link's id, base64url: without the server's key
 * nobody derives one, guesses one or walks from one link to the next. The key
 * is the server secret's own for this use.
 */
function deriveAuditLinkToken(secret: string, linkId: string) {
  const key = createHmac("sha256", secret)
    .update("en-escena:audit-link")
    .digest();

  return createHmac("sha256", key)
    .update(linkId)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

/**
 * A plain SHA-256: the tokens are 128 bits no one can derive without the key,
 * so there is nothing for a salt or a slow hash to protect, and the lookup
 * stays one indexed equality.
 */
function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

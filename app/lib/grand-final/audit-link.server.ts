import { createHash, randomBytes } from "node:crypto";

import { and, asc, count, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLinks } from "@/db/schema";
import { lockEvent } from "@/lib/grand-final/result.server";

/**
 * The `Gran final`'s `auditLink`s: what administration hands to the
 * audience's auditors so they can watch the open round's totals. A link is a
 * bearer secret, so only hashes are stored: the token is shown once, when it
 * is created, and the first browser that opens it gets a session secret of
 * its own in a cookie. From then on the link serves that browser alone, until
 * it is revoked. A link reads totals and nothing else: it casts no vote and
 * opens no other page.
 */

/** The audience's auditors: three people on stage, never more at once. */
export const maxActiveAuditLinks = 3;

export type AuditLinkRow = {
  boundAt: Date | null;
  createdAt: Date;
  id: string;
  label: string;
  revokedAt: Date | null;
};

export type CreateAuditLinkResult =
  | { id: string; ok: true; token: string }
  | { ok: false; reason: "limit-reached" };

/**
 * Issues a link for the named auditor, or refuses one past the live limit.
 * The event row is locked for the count, so two links created at once never
 * both take the last place.
 */
export async function createAuditLink(input: {
  eventId: string;
  label: string;
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
        ),
      );

    if ((live?.count ?? 0) >= maxActiveAuditLinks) {
      return { ok: false, reason: "limit-reached" };
    }

    const token = generateSecret();
    const [link] = await tx
      .insert(auditLinks)
      .values({
        eventId: input.eventId,
        label: input.label,
        tokenHash: hashSecret(token),
      })
      .returning({ id: auditLinks.id });

    return { id: link.id, ok: true, token };
  });
}

/** The event's links, the first created first, revoked ones included. */
export async function listAuditLinks(eventId: string): Promise<AuditLinkRow[]> {
  return await db
    .select({
      boundAt: auditLinks.boundAt,
      createdAt: auditLinks.createdAt,
      id: auditLinks.id,
      label: auditLinks.label,
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

export type AuditLinkRefusal = "already-bound" | "revoked" | "unknown";

export type BindAuditLinkResult =
  { ok: false; reason: AuditLinkRefusal } | { ok: true; sessionSecret: string };

/**
 * Opens the link the token names in the browser holding `sessionSecret`, if
 * any. The first open binds it: one conditional update, so two devices
 * opening it at once leave one bound and refuse the other. The bound browser
 * opens it again with the secret it already holds; any other is refused, as
 * is everyone once the link is revoked.
 */
export async function bindAuditLink(input: {
  sessionSecret: string | null;
  token: string;
}): Promise<BindAuditLinkResult> {
  const tokenHash = hashSecret(input.token);
  const sessionSecret = generateSecret();
  const [bound] = await db
    .update(auditLinks)
    .set({
      boundAt: sql`CURRENT_TIMESTAMP`,
      sessionHash: hashSecret(sessionSecret),
    })
    .where(
      and(
        eq(auditLinks.tokenHash, tokenHash),
        isNull(auditLinks.revokedAt),
        isNull(auditLinks.sessionHash),
      ),
    )
    .returning({ id: auditLinks.id });

  if (bound) {
    return { ok: true, sessionSecret };
  }

  const [link] = await db
    .select({
      revokedAt: auditLinks.revokedAt,
      sessionHash: auditLinks.sessionHash,
    })
    .from(auditLinks)
    .where(eq(auditLinks.tokenHash, tokenHash));

  if (!link) {
    return { ok: false, reason: "unknown" };
  }

  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }

  if (
    input.sessionSecret &&
    link.sessionHash === hashSecret(input.sessionSecret)
  ) {
    return { ok: true, sessionSecret: input.sessionSecret };
  }

  return { ok: false, reason: "already-bound" };
}

/**
 * What a link audits: its event, and when it was issued, which names its
 * round (`readAuditTotals`).
 */
export type AuditedLink = { eventId: string; issuedAt: Date };

export type AuditSession =
  | ({ ok: true } & AuditedLink)
  | { ok: false; reason: Exclude<AuditLinkRefusal, "already-bound"> };

/**
 * The link a browser's session secret audits, read on every request so a
 * revocation takes effect on the next reload.
 */
export async function readAuditSession(
  sessionSecret: string,
): Promise<AuditSession> {
  const [link] = await db
    .select({
      eventId: auditLinks.eventId,
      issuedAt: auditLinks.createdAt,
      revokedAt: auditLinks.revokedAt,
    })
    .from(auditLinks)
    .where(eq(auditLinks.sessionHash, hashSecret(sessionSecret)));

  if (!link) {
    return { ok: false, reason: "unknown" };
  }

  return link.revokedAt
    ? { ok: false, reason: "revoked" }
    : { eventId: link.eventId, issuedAt: link.issuedAt, ok: true };
}

/**
 * 128 random bits, base64url, as a `voteCode`'s: nobody guesses one or walks
 * from one link to the next.
 */
function generateSecret() {
  return randomBytes(16).toString("base64url");
}

/**
 * A plain SHA-256: the secrets are 128 random bits, so there is nothing for a
 * salt or a slow hash to protect, and the lookup stays one indexed equality.
 */
function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

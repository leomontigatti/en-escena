import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { auditLinks } from "@/db/schema";
import { createSavedEvent } from "@/lib/admin/finances/finances.test-support";
import {
  bindAuditLink,
  createAuditLink,
  listAuditLinks,
  maxActiveAuditLinks,
  readAuditSession,
  revokeAuditLink,
} from "@/lib/grand-final/audit-link.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function createLink(eventId: string, label = "Auditora 1") {
  const created = await createAuditLink({ eventId, label });

  if (!created.ok) {
    throw new Error(`The link was not created: ${created.reason}.`);
  }

  return created;
}

async function bind(token: string, sessionSecret: string | null = null) {
  return await bindAuditLink({ sessionSecret, token });
}

describe("`createAuditLink`", () => {
  test("issues a link listed unopened, keeping only the token's hash", async () => {
    const event = await createSavedEvent();

    const created = await createLink(event.id, "Marta");

    expect(created.token).toMatch(/^[\w-]{22,}$/);
    await expect(listAuditLinks(event.id)).resolves.toEqual([
      {
        boundAt: null,
        createdAt: expect.any(Date),
        id: created.id,
        label: "Marta",
        revokedAt: null,
      },
    ]);
    const [row] = await db
      .select()
      .from(auditLinks)
      .where(eq(auditLinks.id, created.id));
    expect(Object.values(row)).not.toContain(created.token);
  });

  test(`refuses a link past ${maxActiveAuditLinks} live ones, revoked ones aside`, async () => {
    const event = await createSavedEvent();
    const links = [];

    for (let index = 0; index < maxActiveAuditLinks; index += 1) {
      links.push(await createLink(event.id, `Auditor ${index + 1}`));
    }

    await expect(
      createAuditLink({ eventId: event.id, label: "Una más" }),
    ).resolves.toEqual({ ok: false, reason: "limit-reached" });

    await revokeAuditLink({ eventId: event.id, linkId: links[0].id });

    await expect(
      createAuditLink({ eventId: event.id, label: "Reemplazo" }),
    ).resolves.toMatchObject({ ok: true });
  });

  test("counts only the event's own links toward the limit", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();

    for (let index = 0; index < maxActiveAuditLinks; index += 1) {
      await createLink(other.id, `Auditor ${index + 1}`);
    }

    await expect(
      createAuditLink({ eventId: event.id, label: "Marta" }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("`bindAuditLink`", () => {
  test("binds the link to the first session that opens it", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);

    const bound = await bind(link.token);

    expect(bound).toEqual({ ok: true, sessionSecret: expect.any(String) });
    await expect(listAuditLinks(event.id)).resolves.toEqual([
      expect.objectContaining({ boundAt: expect.any(Date) }),
    ]);
    await expect(
      readAuditSession(bound.ok ? bound.sessionSecret : ""),
    ).resolves.toEqual({
      eventId: event.id,
      issuedAt: expect.any(Date),
      ok: true,
    });
  });

  test("refuses a second device, with or without a session of its own", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);
    const other = await createLink(event.id, "Auditor 2");
    const otherSession = await bind(other.token);
    await bind(link.token);

    await expect(bind(link.token)).resolves.toEqual({
      ok: false,
      reason: "already-bound",
    });
    await expect(
      bind(link.token, otherSession.ok ? otherSession.sessionSecret : ""),
    ).resolves.toEqual({ ok: false, reason: "already-bound" });
  });

  test("lets the bound session open its own link again", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);
    const first = await bind(link.token);
    const sessionSecret = first.ok ? first.sessionSecret : "";

    await expect(bind(link.token, sessionSecret)).resolves.toEqual({
      ok: true,
      sessionSecret,
    });
  });

  test("refuses an unknown token", async () => {
    await expect(bind("no-es-un-acceso")).resolves.toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  test("refuses a revoked link before it is opened", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);
    await revokeAuditLink({ eventId: event.id, linkId: link.id });

    await expect(bind(link.token)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  test("refuses a revoked link to the session it was bound to", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);
    const bound = await bind(link.token);
    const sessionSecret = bound.ok ? bound.sessionSecret : "";
    await revokeAuditLink({ eventId: event.id, linkId: link.id });

    await expect(bind(link.token, sessionSecret)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
    await expect(readAuditSession(sessionSecret)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
  });
});

describe("`readAuditSession`", () => {
  test("refuses a session no link was bound to", async () => {
    await expect(readAuditSession("no-es-una-sesion")).resolves.toEqual({
      ok: false,
      reason: "unknown",
    });
  });
});

describe("`revokeAuditLink`", () => {
  test("revokes once and reads a second revoke as already revoked", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id, "Marta");

    await expect(
      revokeAuditLink({ eventId: event.id, linkId: link.id }),
    ).resolves.toEqual({ label: "Marta", ok: true });
    await expect(
      revokeAuditLink({ eventId: event.id, linkId: link.id }),
    ).resolves.toEqual({ ok: false, reason: "already-revoked" });
    await expect(listAuditLinks(event.id)).resolves.toEqual([
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    ]);
  });

  test("does not reach another event's link", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();
    const link = await createLink(other.id);

    await expect(
      revokeAuditLink({ eventId: event.id, linkId: link.id }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});

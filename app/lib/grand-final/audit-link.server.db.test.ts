import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { auditLinks } from "@/db/schema";
import { createSavedEvent } from "@/lib/admin/finances/finances.test-support";
import {
  createAuditLink,
  listAuditLinks,
  maxActiveAuditLinks,
  openAuditLink,
  readAuditLinkHandover,
  readAuditSession,
  revokeAuditLink,
} from "@/lib/grand-final/audit-link.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const secret = "secreto-de-prueba";

async function createLink(eventId: string, label = "Auditora 1") {
  const created = await createAuditLink({ eventId, label, secret });

  if (!created.ok) {
    throw new Error(`The link was not created: ${created.reason}.`);
  }

  return created;
}

describe("`createAuditLink`", () => {
  test("issues a link listed unopened, keeping only the token's hash", async () => {
    const event = await createSavedEvent();

    const created = await createLink(event.id, "Marta");

    expect(created.token).toMatch(/^[\w-]{22,}$/);
    await expect(listAuditLinks(event.id)).resolves.toEqual([
      {
        createdAt: expect.any(Date),
        id: created.id,
        label: "Marta",
        openedAt: null,
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
      createAuditLink({ eventId: event.id, label: "Una más", secret }),
    ).resolves.toEqual({ ok: false, reason: "limit-reached" });

    await revokeAuditLink({ eventId: event.id, linkId: links[0].id });

    await expect(
      createAuditLink({ eventId: event.id, label: "Reemplazo", secret }),
    ).resolves.toMatchObject({ ok: true });
  });

  test("counts only the event's own links toward the limit", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();

    for (let index = 0; index < maxActiveAuditLinks; index += 1) {
      await createLink(other.id, `Auditor ${index + 1}`);
    }

    await expect(
      createAuditLink({ eventId: event.id, label: "Marta", secret }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("`readAuditLinkHandover`", () => {
  test("hands the same link over again, as many times as asked", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id, "Marta");

    await expect(
      readAuditLinkHandover({ eventId: event.id, linkId: link.id, secret }),
    ).resolves.toEqual({
      issuedAt: expect.any(Date),
      label: "Marta",
      ok: true,
      token: link.token,
    });
    await expect(
      readAuditLinkHandover({ eventId: event.id, linkId: link.id, secret }),
    ).resolves.toEqual({
      issuedAt: expect.any(Date),
      label: "Marta",
      ok: true,
      token: link.token,
    });
  });

  test("hands over no link whose token the server's key no longer derives", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);

    await expect(
      readAuditLinkHandover({
        eventId: event.id,
        linkId: link.id,
        secret: "otro-secreto",
      }),
    ).resolves.toEqual({ ok: false, reason: "key-changed" });
  });

  test("hands over no revoked link", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);
    await revokeAuditLink({ eventId: event.id, linkId: link.id });

    await expect(
      readAuditLinkHandover({ eventId: event.id, linkId: link.id, secret }),
    ).resolves.toEqual({ ok: false, reason: "revoked" });
  });

  test("does not reach another event's link", async () => {
    const event = await createSavedEvent();
    const other = await createSavedEvent();
    const link = await createLink(other.id);

    await expect(
      readAuditLinkHandover({ eventId: event.id, linkId: link.id, secret }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});

describe("`openAuditLink`", () => {
  test("opens on any device, noting when it was first opened", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);

    await expect(openAuditLink(link.token)).resolves.toEqual({ ok: true });
    const [{ openedAt }] = await listAuditLinks(event.id);
    await expect(openAuditLink(link.token)).resolves.toEqual({ ok: true });

    expect(openedAt).toBeInstanceOf(Date);
    await expect(listAuditLinks(event.id)).resolves.toEqual([
      expect.objectContaining({ openedAt }),
    ]);
  });

  test("refuses an unknown token", async () => {
    await expect(openAuditLink("no-es-un-acceso")).resolves.toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  test("refuses a revoked link", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);
    await revokeAuditLink({ eventId: event.id, linkId: link.id });

    await expect(openAuditLink(link.token)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
  });
});

describe("`readAuditSession`", () => {
  test("reads the link its token names, until it is revoked", async () => {
    const event = await createSavedEvent();
    const link = await createLink(event.id);

    await expect(readAuditSession(link.token)).resolves.toEqual({
      eventId: event.id,
      issuedAt: expect.any(Date),
      ok: true,
    });

    await revokeAuditLink({ eventId: event.id, linkId: link.id });

    await expect(readAuditSession(link.token)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  test("refuses a token no link has", async () => {
    await expect(readAuditSession("no-es-un-acceso")).resolves.toEqual({
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

import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createSavedEvent } from "@/lib/admin/finances/finances.test-support";
import { bindAuditLink } from "@/lib/grand-final/audit-link.server";
import { readAuditLinkToken } from "@/lib/grand-final/audit-url";

import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "../list/server";
import type { GrandFinalListActionData } from "../list/shared";
import { createAuditLinkIntent, revokeAuditLinkIntent } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/gran-final";

async function signedIn(body?: FormData, role: "admin" | "auditor" = "admin") {
  const { request } = await createSignedInRequest({
    body,
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role,
  });

  return request;
}

/** The action's answer, whether plain or with headers of its own. */
async function submit(
  values: Record<string, string>,
  role: "admin" | "auditor" = "admin",
) {
  const body = new FormData();

  for (const [name, value] of Object.entries(values)) {
    body.set(name, value);
  }

  const answer = await handleGrandFinalListAction(await signedIn(body, role));

  if ("init" in answer && "data" in answer) {
    return {
      data: answer.data as GrandFinalListActionData,
      headers: new Headers(answer.init?.headers),
      status: answer.init?.status,
    };
  }

  return {
    data: answer as GrandFinalListActionData,
    headers: new Headers(),
    status: 200,
  };
}

async function createLink(label: string) {
  return await submit({ intent: createAuditLinkIntent, label });
}

async function list() {
  return await loadGrandFinalListRouteData(await signedIn());
}

describe("the audit links of the `Gran final` list", () => {
  test("creates a link whose address carries its token in the fragment, never cached", async () => {
    await createSavedEvent();

    const created = await createLink("Marta");

    expect(created.data).toMatchObject({
      auditLink: {
        label: "Marta",
        qrDataUri: expect.stringMatching(/^data:image\/svg\+xml/),
        url: expect.stringMatching(/\/auditoria#[\w-]{22}$/),
      },
      status: "success",
    });
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    // The address opens the link it names.
    const token = readAuditLinkToken(
      new URL(created.data.auditLink?.url ?? "").hash,
    );
    await expect(
      bindAuditLink({ sessionSecret: null, token: token ?? "" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(list()).resolves.toMatchObject({
      auditLinkCreateBlockReasons: [],
      auditLinks: [{ blockReasons: [], label: "Marta", revokedAt: null }],
    });
  });

  test("keeps the token out of the list", async () => {
    await createSavedEvent();
    const created = await createLink("Marta");
    const token = readAuditLinkToken(
      new URL(created.data.auditLink?.url ?? "").hash,
    );

    expect(JSON.stringify(await list())).not.toContain(token);
  });

  test("refuses an empty name", async () => {
    await createSavedEvent();

    await expect(createLink("  ")).resolves.toMatchObject({
      data: { status: "error" },
      status: 400,
    });
  });

  test("refuses a fourth live link and reports the limit on the list", async () => {
    await createSavedEvent();
    await createLink("Marta");
    await createLink("Jorge");
    await createLink("Ana");

    await expect(createLink("Luis")).resolves.toMatchObject({
      data: {
        message:
          "Ya hay 3 accesos de auditoría vigentes. Revocá uno para crear otro.",
        status: "error",
      },
      status: 409,
    });
    await expect(list()).resolves.toMatchObject({
      auditLinkCreateBlockReasons: [{ code: "limit-reached" }],
    });
  });

  test("revokes a link and reports why it cannot be revoked again", async () => {
    await createSavedEvent();
    await createLink("Marta");
    const [link] = (await list()).auditLinks;

    await expect(
      submit({ intent: revokeAuditLinkIntent, linkId: link.id }),
    ).resolves.toMatchObject({
      data: {
        message:
          "Revocaste el acceso de auditoría de Marta. Deja de mostrar los totales en su próxima recarga.",
        status: "success",
      },
    });
    await expect(
      submit({ intent: revokeAuditLinkIntent, linkId: link.id }),
    ).resolves.toMatchObject({
      data: { message: "Ese acceso de auditoría ya estaba revocado." },
      status: 409,
    });
    await expect(list()).resolves.toMatchObject({
      auditLinks: [{ blockReasons: [{ code: "revoked" }] }],
    });
  });

  test("turns the auditor role away", async () => {
    await createSavedEvent();

    await expectThrownResponse(
      submit({ intent: createAuditLinkIntent, label: "Marta" }, "auditor"),
      403,
    );
    await expect(list()).resolves.toMatchObject({ auditLinks: [] });
  });
});

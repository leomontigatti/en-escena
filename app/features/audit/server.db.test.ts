import { describe, expect, test } from "vitest";

import { createSavedEvent } from "@/lib/admin/finances/finances.test-support";
import {
  createAuditLink,
  revokeAuditLink,
} from "@/lib/grand-final/audit-link.server";
import type { AuditTotals } from "@/lib/grand-final/audit-totals.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import { handleAuditAction, loadAuditPage, type AuditPageDeps } from "./server";

installDatabaseTestHooks();

/** Totals of their own, so a test reads what the page was handed. */
const totals: AuditTotals = { roundNumber: 1, status: "closed" };

const deps: AuditPageDeps = {
  readTotals: async () => totals,
  secure: false,
};

/** A browser: the cookie the page set so far. */
type Browser = { cookie: string };

const newBrowser = (): Browser => ({ cookie: "" });

function keepCookie(browser: Browser, response: { headers: Headers }) {
  for (const cookie of response.headers.getSetCookie()) {
    browser.cookie = cookie.split(";")[0];
  }
}

function request(browser: Browser, init: RequestInit = {}) {
  return new Request("http://localhost/auditoria", {
    ...init,
    headers: browser.cookie ? { Cookie: browser.cookie } : {},
  });
}

/** Opens the link with its token, as the page's form does. */
async function open(browser: Browser, token: string) {
  const answer = await handleAuditAction(
    request(browser, { body: new URLSearchParams({ token }), method: "POST" }),
    deps,
  );

  if (answer instanceof Response) {
    keepCookie(browser, answer);

    return {
      headers: answer.headers,
      location: answer.headers.get("Location"),
      refusal: null,
    };
  }

  return {
    headers: new Headers(answer.init?.headers),
    location: null,
    refusal: { ...answer.data, status: answer.init?.status },
  };
}

async function load(browser: Browser) {
  const answer = await loadAuditPage(request(browser), deps);
  const headers = new Headers(answer.init?.headers);
  keepCookie(browser, { headers });

  return { headers, page: answer.data };
}

async function seedLink() {
  const event = await createSavedEvent();
  const created = await createAuditLink({ eventId: event.id, label: "Marta" });

  if (!created.ok) {
    throw new Error("The link was not created.");
  }

  return { eventId: event.id, ...created };
}

describe("the audit page", () => {
  test("asks for the link when the browser opened none", async () => {
    const answer = await load(newBrowser());

    expect(answer.page).toEqual({ state: "open-link" });
    expect(answer.headers.get("Cache-Control")).toBe("no-store");
    expect(answer.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("binds the link to the first browser and shows it the totals", async () => {
    const link = await seedLink();
    const browser = newBrowser();

    const opened = await open(browser, link.token);

    expect(opened.location).toBe("/auditoria");
    expect(opened.headers.get("Cache-Control")).toBe("no-store");
    expect(opened.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(browser.cookie).not.toBe("");
    expect(browser.cookie).not.toContain(link.token);
    await expect(load(browser)).resolves.toMatchObject({
      page: { state: "totals", totals },
    });
  });

  test("refuses a second browser", async () => {
    const link = await seedLink();
    await open(newBrowser(), link.token);

    const second = await open(newBrowser(), link.token);

    expect(second.refusal).toEqual({ reason: "already-bound", status: 409 });
    expect(second.headers.get("Cache-Control")).toBe("no-store");
  });

  test("refuses an unknown token", async () => {
    await expect(open(newBrowser(), "no-es-un-acceso")).resolves.toMatchObject({
      refusal: { reason: "unknown", status: 404 },
    });
  });

  test("refuses an empty token", async () => {
    await expect(open(newBrowser(), "")).resolves.toMatchObject({
      refusal: { reason: "unknown", status: 404 },
    });
  });

  test("refuses a revoked token before it is opened", async () => {
    const link = await seedLink();
    await revokeAuditLink({ eventId: link.eventId, linkId: link.id });

    await expect(open(newBrowser(), link.token)).resolves.toMatchObject({
      refusal: { reason: "revoked", status: 410 },
    });
  });

  test("shuts the bound browser out on its next load once revoked", async () => {
    const link = await seedLink();
    const browser = newBrowser();
    await open(browser, link.token);
    await revokeAuditLink({ eventId: link.eventId, linkId: link.id });

    const answer = await load(browser);

    expect(answer.page).toEqual({ reason: "revoked", state: "refused" });
    expect(browser.cookie).toBe("en_escena_audit=");
  });

  test("refuses a session cookie no link was bound to", async () => {
    const browser = { cookie: "en_escena_audit=ImZhbHNvIg%3D%3D" };

    await expect(load(browser)).resolves.toMatchObject({
      page: { reason: "unknown", state: "refused" },
    });
  });
});

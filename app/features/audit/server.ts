import { createCookie, data, redirect } from "react-router";

import {
  openAuditLink,
  readAuditSession,
} from "@/lib/grand-final/audit-link.server";
import type { AuditedLink } from "@/lib/grand-final/audit-link.server";
import {
  readAuditTotals,
  type AuditTotals,
} from "@/lib/grand-final/audit-totals.server";
import { auditPath } from "@/lib/grand-final/audit-url";
import { readFormString } from "@/lib/shared/forms";

import {
  openAuditLinkSchema,
  type AuditActionData,
  type AuditPageData,
} from "./shared";

/**
 * The audit page of the `Gran final`, `/auditoria`: public, with no access
 * session, reached only through an `auditLink`, on any device. Opening the
 * link keeps its token in a cookie of the browser's; every load reads the
 * link again, so a revocation shuts the page on the next reload.
 * The page reads totals and has no other write: nothing here casts a vote.
 *
 * Every answer is kept by no cache and sends no `Referer` onward: the page
 * holds a bearer secret and live totals nobody else may see.
 */
const pageHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

/**
 * A voting night and its `Desempate`: a browser that opened the link keeps it
 * that long, and a link revoked earlier stops serving it anyway.
 */
const sessionMaxAgeSeconds = 24 * 60 * 60;

export type AuditPageDeps = {
  readTotals: (link: AuditedLink) => Promise<AuditTotals>;
  /** Whether the cookie is `Secure`: everywhere but plain-HTTP dev. */
  secure: boolean;
};

function createDefaultAuditPageDeps(): AuditPageDeps {
  return {
    readTotals: readAuditTotals,
    secure: process.env.NODE_ENV === "production",
  };
}

function createSessionCookie(secure: boolean) {
  return createCookie("en_escena_audit", {
    httpOnly: true,
    maxAge: sessionMaxAgeSeconds,
    // The whole origin: the router reads the page's data at `/auditoria.data`,
    // which a cookie scoped to `/auditoria` never reaches.
    path: "/",
    sameSite: "lax",
    secure,
  });
}

async function readSessionToken(
  cookie: ReturnType<typeof createSessionCookie>,
  request: Request,
) {
  const value: unknown = await cookie.parse(request.headers.get("Cookie"));

  return typeof value === "string" && value !== "" ? value : null;
}

export async function loadAuditPage(
  request: Request,
  deps: AuditPageDeps = createDefaultAuditPageDeps(),
) {
  const cookie = createSessionCookie(deps.secure);
  const token = await readSessionToken(cookie, request);

  if (!token) {
    return data<AuditPageData>(
      { state: "open-link" },
      { headers: pageHeaders },
    );
  }

  const session = await readAuditSession(token);

  if (!session.ok) {
    // The token serves nothing any more: the browser drops it.
    return data<AuditPageData>(
      { reason: session.reason, state: "refused" },
      {
        headers: {
          ...pageHeaders,
          "Set-Cookie": await cookie.serialize("", { maxAge: 0 }),
        },
      },
    );
  }

  return data<AuditPageData>(
    {
      state: "totals",
      totals: await deps.readTotals({
        eventId: session.eventId,
        issuedAt: session.issuedAt,
      }),
    },
    { headers: pageHeaders },
  );
}

const refusalStatuses: Record<AuditActionData["reason"], number> = {
  revoked: 410,
  unknown: 404,
};

/**
 * Opens the link the form's token names in this browser, which lands on the
 * totals; once the link is revoked, every browser gets the refusal.
 */
export async function handleAuditAction(
  request: Request,
  deps: AuditPageDeps = createDefaultAuditPageDeps(),
) {
  const formData = await request.formData();
  const parsed = openAuditLinkSchema.safeParse({
    token: readFormString(formData, "token"),
  });

  if (!parsed.success) {
    return data<AuditActionData>(
      { reason: "unknown" },
      { headers: pageHeaders, status: refusalStatuses.unknown },
    );
  }

  const cookie = createSessionCookie(deps.secure);
  const result = await openAuditLink(parsed.data.token);

  if (!result.ok) {
    return data<AuditActionData>(
      { reason: result.reason },
      { headers: pageHeaders, status: refusalStatuses[result.reason] },
    );
  }

  return redirect(auditPath, {
    headers: {
      ...pageHeaders,
      "Set-Cookie": await cookie.serialize(parsed.data.token),
    },
  });
}

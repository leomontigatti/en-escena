import { z } from "zod";

import type { AuditLinkRefusal } from "@/lib/grand-final/audit-link.server";
import type { AuditTotals } from "@/lib/grand-final/audit-totals.server";

/**
 * What the audit page and its server agree on. A module of its own because
 * the view imports it and the server module cannot reach the browser.
 */

/** The form that opens a link in this browser, with the fragment's token. */
export const openAuditLinkSchema = z.object({
  token: z.string().trim().min(1).max(64),
});

/**
 * The page in its three states: a link to open in this browser, a refusal,
 * or the totals of the browser's link.
 */
export type AuditPageData =
  | { state: "open-link" }
  | { reason: AuditLinkRefusal; state: "refused" }
  | { state: "totals"; totals: AuditTotals };

/** Why opening the link failed: only refusals come back, a success redirects. */
export type AuditActionData = { reason: AuditLinkRefusal };

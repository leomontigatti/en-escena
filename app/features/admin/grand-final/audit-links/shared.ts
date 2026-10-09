import { z } from "zod";

import type { AuditLinkRow } from "@/lib/grand-final/audit-link.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * What the `Gran final` list's `auditLink`s and their server agree on: the two
 * intents, their schemas, and the reasons an action cannot run. A module of
 * its own because the view imports it and the server module cannot reach the
 * browser.
 */

export const createAuditLinkIntent = "create-audit-link";
export const revokeAuditLinkIntent = "revoke-audit-link";

const auditLinkLabelMaxLength = 80;

export const createAuditLinkSchema = z.object({
  intent: z.literal(createAuditLinkIntent),
  label: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .max(
      auditLinkLabelMaxLength,
      `Usá hasta ${auditLinkLabelMaxLength} caracteres.`,
    ),
});

export type CreateAuditLinkFormValues = z.input<typeof createAuditLinkSchema>;

export const revokeAuditLinkSchema = z.object({
  intent: z.literal(revokeAuditLinkIntent),
  linkId: z.string().trim().min(1),
});

/**
 * The link just created, as its dialog hands it over: the only time its
 * address exists outside the auditor's browser, since only its hash is kept.
 */
export type CreatedAuditLink = {
  label: string;
  /** The link's QR, an SVG as a data URI, for the auditor to scan. */
  qrDataUri: string;
  url: string;
};

/**
 * Why `Crear acceso de auditoría` cannot run: the live links are at the
 * limit. Built by the server, which owns the rule; the menu item stays and
 * opens these reasons (docs/agents/form-feedback.md).
 */
export type AuditLinkCreateBlockReason = {
  code: "limit-reached";
  label: string;
};

/** What the limit's refusal says, before the action and after it. */
export const auditLinkLimitMessage =
  "Ya hay 3 accesos de auditoría vigentes. Revocá uno para crear otro.";

/** Why a link can no longer be revoked: it already was. */
export type AuditLinkBlockReason = { code: "revoked"; label: string };

export type AuditLinkListRow = AuditLinkRow & {
  blockReasons: AuditLinkBlockReason[];
};

import { z } from "zod";

import type { AuditLinkRow } from "@/lib/grand-final/audit-link.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * What the `Gran final` list's `auditLink`s and their server agree on: the
 * intents, their schemas, and the reasons an action cannot run. A module of
 * its own because the view imports it and the server module cannot reach the
 * browser.
 */

export const createAuditLinkIntent = "create-audit-link";
export const revokeAuditLinkIntent = "revoke-audit-link";
export const showAuditLinkIntent = "show-audit-link";

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

export const showAuditLinkSchema = z.object({
  intent: z.literal(showAuditLinkIntent),
  linkId: z.string().trim().min(1),
});

/**
 * A live link as its dialog hands it over, just created or shown again. Only
 * its hash is kept: the server derives the address again for each answer,
 * which no cache keeps, and the list never carries it.
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

/**
 * Why a link can no longer be shown or revoked: it already was revoked, or
 * the round it shows has closed and it opens nothing any more.
 */
export type AuditLinkBlockReason = {
  code: "expired" | "revoked";
  label: string;
};

export type AuditLinkListRow = AuditLinkRow & {
  blockReasons: AuditLinkBlockReason[];
};

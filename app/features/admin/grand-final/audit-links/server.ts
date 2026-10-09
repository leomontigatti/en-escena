import { data } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  createAuditLink,
  listAuditLinks,
  maxActiveAuditLinks,
  revokeAuditLink,
  type RevokeAuditLinkResult,
} from "@/lib/grand-final/audit-link.server";
import { buildAuditLinkUrl } from "@/lib/grand-final/audit-url";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { readFormString } from "@/lib/shared/forms";

import type { GrandFinalListActionData } from "../list/shared";
import { renderVoteCodeQrSvg } from "../vote-codes/sheet";
import {
  auditLinkLimitMessage,
  createAuditLinkIntent,
  createAuditLinkSchema,
  revokeAuditLinkSchema,
  type AuditLinkCreateBlockReason,
  type AuditLinkListRow,
} from "./shared";

type AuditLinkActionResult =
  GrandFinalListActionData | ReturnType<typeof data<GrandFinalListActionData>>;

function refusal(message: string, status: number) {
  return data({ message, status: "error" as const }, { status });
}

/** The event's links for the list, each with why it can no longer revoke. */
export async function listAuditLinkRows(
  eventId: string,
): Promise<AuditLinkListRow[]> {
  const links = await listAuditLinks(eventId);

  return links.map((link) => ({
    ...link,
    blockReasons: link.revokedAt
      ? [
          {
            code: "revoked",
            label: `El acceso de ${link.label} ya fue revocado el ${formatBusinessDate(link.revokedAt)}.`,
          },
        ]
      : [],
  }));
}

/** Why no other link can be created now, read off the list's rows. */
export function readAuditLinkCreateBlockReasons(
  links: AuditLinkListRow[],
): AuditLinkCreateBlockReason[] {
  const live = links.filter((link) => !link.revokedAt).length;

  return live >= maxActiveAuditLinks
    ? [
        {
          code: "limit-reached",
          label: auditLinkLimitMessage,
        },
      ]
    : [];
}

/**
 * The link writes of the `Gran final` list: create one, or revoke one. Both
 * stay on the list, which revalidates. A created link's address goes back
 * once, in this answer, which no cache keeps. The caller has already checked
 * the admin panel guard and read the form.
 */
export async function handleAuditLinkIntent(
  request: Request,
  formData: FormData,
): Promise<AuditLinkActionResult> {
  const { selectedEventId } = await loadEventContext(request);

  if (!selectedEventId) {
    return refusal(
      "Elegí un evento activo para crear o revocar accesos de auditoría.",
      409,
    );
  }

  if (readFormString(formData, "intent") === createAuditLinkIntent) {
    return await createLink(request, formData, selectedEventId);
  }

  return await revokeLink(formData, selectedEventId);
}

async function createLink(
  request: Request,
  formData: FormData,
  eventId: string,
) {
  const parsed = createAuditLinkSchema.safeParse({
    intent: readFormString(formData, "intent"),
    label: readFormString(formData, "label"),
  });

  if (!parsed.success) {
    return refusal(
      parsed.error.issues[0]?.message ??
        "Escribí a quién le das el acceso de auditoría.",
      400,
    );
  }

  const created = await createAuditLink({ eventId, label: parsed.data.label });

  if (!created.ok) {
    return refusal(auditLinkLimitMessage, 409);
  }

  const url = buildAuditLinkUrl(
    process.env.APP_URL || new URL(request.url).origin,
    created.token,
  );
  const qrSvg = await renderVoteCodeQrSvg(url);

  // The only answer that carries the link: no browser or proxy keeps it.
  return data(
    {
      auditLink: {
        label: parsed.data.label,
        qrDataUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`,
        url,
      },
      message: `Creaste el acceso de auditoría de ${parsed.data.label}.`,
      status: "success" as const,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const revokeRefusals: Record<
  Extract<RevokeAuditLinkResult, { ok: false }>["reason"],
  { message: string; status: number }
> = {
  "already-revoked": {
    message: "Ese acceso de auditoría ya estaba revocado.",
    status: 409,
  },
  "not-found": {
    message:
      "Ese acceso de auditoría ya no está en el evento activo. Revisá la lista y volvé a intentarlo.",
    status: 404,
  },
};

async function revokeLink(formData: FormData, eventId: string) {
  const parsed = revokeAuditLinkSchema.safeParse({
    intent: readFormString(formData, "intent"),
    linkId: readFormString(formData, "linkId"),
  });

  if (!parsed.success) {
    return refusal("Elegí el acceso de auditoría que querés revocar.", 400);
  }

  const result = await revokeAuditLink({
    eventId,
    linkId: parsed.data.linkId,
  });

  if (!result.ok) {
    const { message, status } = revokeRefusals[result.reason];

    return refusal(message, status);
  }

  return {
    message: `Revocaste el acceso de auditoría de ${result.label}. Deja de mostrar los totales en su próxima recarga.`,
    status: "success" as const,
  };
}

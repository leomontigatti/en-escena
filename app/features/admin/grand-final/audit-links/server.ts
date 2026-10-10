import { data } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  createAuditLink,
  listAuditLinks,
  maxActiveAuditLinks,
  readAuditLinkHandover,
  revokeAuditLink,
  type AuditLinkRow,
  type ReadAuditLinkHandoverResult,
  type RevokeAuditLinkResult,
} from "@/lib/grand-final/audit-link.server";
import { isAuditLinkExpired } from "@/lib/grand-final/audit-totals.server";
import { buildAuditLinkUrl } from "@/lib/grand-final/audit-url";
import { formatLongBusinessDate } from "@/lib/shared/business-time-zone";
import { readFormString } from "@/lib/shared/forms";

import type { GrandFinalListActionData } from "../list/shared";
import { renderVoteCodeQrSvg } from "../vote-codes/sheet";
import {
  auditLinkLimitMessage,
  createAuditLinkIntent,
  createAuditLinkSchema,
  revokeAuditLinkSchema,
  showAuditLinkIntent,
  showAuditLinkSchema,
  type AuditLinkBlockReason,
  type AuditLinkCreateBlockReason,
  type AuditLinkListRow,
} from "./shared";

type AuditLinkActionResult =
  GrandFinalListActionData | ReturnType<typeof data<GrandFinalListActionData>>;

function refusal(message: string, status: number) {
  return data({ message, status: "error" as const }, { status });
}

/**
 * The event's links for the list, each with why it can no longer be shown or
 * revoked: revoked, or spent once the round it shows closed.
 */
export async function listAuditLinkRows(
  eventId: string,
): Promise<AuditLinkListRow[]> {
  const links = await listAuditLinks(eventId);

  return await Promise.all(
    links.map(async (link) => ({
      ...link,
      blockReasons: await readAuditLinkBlockReasons(link, eventId),
    })),
  );
}

async function readAuditLinkBlockReasons(
  link: AuditLinkRow,
  eventId: string,
): Promise<AuditLinkBlockReason[]> {
  if (link.revokedAt) {
    return [
      {
        code: "revoked",
        label: `El acceso de ${link.label} ya fue revocado el ${formatLongBusinessDate(link.revokedAt)}.`,
      },
    ];
  }

  return (await isAuditLinkExpired({ eventId, issuedAt: link.createdAt }))
    ? [
        {
          code: "expired",
          label: `El acceso de ${link.label} dejó de funcionar: la votación que mostraba se cerró.`,
        },
      ]
    : [];
}

/**
 * Why no other link can be created now, read off the list's rows: a link
 * neither revoked nor spent holds a place.
 */
export function readAuditLinkCreateBlockReasons(
  links: AuditLinkListRow[],
): AuditLinkCreateBlockReason[] {
  const live = links.filter((link) => link.blockReasons.length === 0).length;

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
 * The link actions of the `Gran final` list: create one, show a live one
 * again, or revoke one. All stay on the list, which revalidates. A link's
 * address goes back only in the answer to a create or a show, which no cache
 * keeps. The caller has already checked
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

  if (readFormString(formData, "intent") === showAuditLinkIntent) {
    return await showLink(request, formData, selectedEventId);
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

  const created = await createAuditLink({
    eventId,
    label: parsed.data.label,
    secret: readAuditLinkSecret(),
  });

  if (!created.ok) {
    return refusal(auditLinkLimitMessage, 409);
  }

  return await handOver(request, {
    label: parsed.data.label,
    message: `Creaste el acceso de auditoría de ${parsed.data.label}.`,
    token: created.token,
  });
}

const showRefusals: Record<
  Extract<ReadAuditLinkHandoverResult, { ok: false }>["reason"],
  { message: string; status: number }
> = {
  "key-changed": {
    message:
      "Ese acceso de auditoría se creó con otra clave del servidor y ya no se puede mostrar. Revocalo y creá uno nuevo.",
    status: 409,
  },
  "not-found": {
    message:
      "Ese acceso de auditoría ya no está en el evento activo. Revisá la lista y volvé a intentarlo.",
    status: 404,
  },
  revoked: {
    message:
      "Ese acceso de auditoría fue revocado y ya no se puede abrir. Creá uno nuevo.",
    status: 410,
  },
};

async function showLink(request: Request, formData: FormData, eventId: string) {
  const parsed = showAuditLinkSchema.safeParse({
    intent: readFormString(formData, "intent"),
    linkId: readFormString(formData, "linkId"),
  });

  if (!parsed.success) {
    return refusal("Elegí el acceso de auditoría que querés ver.", 400);
  }

  const shown = await readAuditLinkHandover({
    eventId,
    linkId: parsed.data.linkId,
    secret: readAuditLinkSecret(),
  });

  if (!shown.ok) {
    const { message, status } = showRefusals[shown.reason];

    return refusal(message, status);
  }

  if (await isAuditLinkExpired({ eventId, issuedAt: shown.issuedAt })) {
    return refusal(
      `El acceso de ${shown.label} dejó de funcionar: la votación que mostraba se cerró.`,
      410,
    );
  }

  return await handOver(request, {
    label: shown.label,
    message: "",
    token: shown.token,
  });
}

/** A live link's address and QR, in an answer no browser or proxy keeps. */
async function handOver(
  request: Request,
  link: { label: string; message: string; token: string },
) {
  const url = buildAuditLinkUrl(
    process.env.APP_URL || new URL(request.url).origin,
    link.token,
  );
  const qrSvg = await renderVoteCodeQrSvg(url);

  return data(
    {
      auditLink: {
        label: link.label,
        qrDataUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`,
        url,
      },
      message: link.message,
      status: "success" as const,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * The key a link's token is derived with, from `BETTER_AUTH_SECRET`, already
 * required in production; it fails closed there without it, as the voter
 * cookie does. Dev and tests fall back to a fixed value.
 */
function readAuditLinkSecret() {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production to derive audit links.",
    );
  }

  return "development-audit-link-secret-development-audit-link-secret";
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

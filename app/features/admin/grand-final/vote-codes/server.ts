import { data } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  createVoteCodeBatch,
  listVoteCodeBatches,
  readVoteCodeBatch,
  voidVoteCodeBatch,
  type VoidVoteCodeBatchResult,
} from "@/lib/grand-final/vote-codes.server";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { readFormString } from "@/lib/shared/forms";

import type { GrandFinalListActionData } from "../list/shared";
import { renderVoteCodeQrSvg, renderVoteCodeSheet } from "./sheet";
import {
  createVoteCodeBatchIntent,
  createVoteCodeBatchSchema,
  parseVoteCodeCount,
  voidVoteCodeBatchSchema,
  voteCodeCountMessage,
  type VoteCodeBatchListRow,
} from "./shared";

type VoteCodeActionResult =
  GrandFinalListActionData | ReturnType<typeof data<GrandFinalListActionData>>;

function refusal(message: string, status: number) {
  return data({ message, status: "error" as const }, { status });
}

/** The event's batches for the list, each with why it can no longer act. */
export async function listVoteCodeBatchRows(
  eventId: string,
): Promise<VoteCodeBatchListRow[]> {
  const batches = await listVoteCodeBatches(eventId);

  return batches.map((batch) => ({
    ...batch,
    blockReasons: batch.voidedAt
      ? [
          {
            code: "voided",
            label: `El lote ${batch.number} fue anulado el ${formatBusinessDate(batch.voidedAt)}: sus códigos QR ya no sirven para votar.`,
          },
        ]
      : [],
  }));
}

/**
 * The batch writes of the `Gran final` list: issue one, or void one. Both stay
 * on the list, which revalidates and shows the batch as it now stands; the
 * answer is a toast (docs/agents/form-feedback.md). The caller has already
 * checked the admin panel guard and read the form.
 */
export async function handleVoteCodeBatchIntent(
  request: Request,
  formData: FormData,
): Promise<VoteCodeActionResult> {
  const { selectedEventId } = await loadEventContext(request);

  if (!selectedEventId) {
    return refusal(
      "Elegí un evento activo para generar o anular códigos QR.",
      409,
    );
  }

  if (readFormString(formData, "intent") === createVoteCodeBatchIntent) {
    return await createBatch(formData, selectedEventId);
  }

  return await voidBatch(formData, selectedEventId);
}

async function createBatch(formData: FormData, eventId: string) {
  const parsed = createVoteCodeBatchSchema.safeParse({
    count: readFormString(formData, "count"),
    intent: readFormString(formData, "intent"),
  });

  if (!parsed.success) {
    return refusal(
      parsed.error.issues[0]?.message ?? voteCodeCountMessage,
      400,
    );
  }

  const count = parseVoteCodeCount(parsed.data.count);
  const batch = await createVoteCodeBatch({ count, eventId });

  return {
    message: `Generaste el lote ${batch.number} con ${count} códigos QR. Imprimilo desde la lista de lotes.`,
    status: "success" as const,
  };
}

const voidRefusals: Record<
  Extract<VoidVoteCodeBatchResult, { ok: false }>["reason"],
  { message: string; status: number }
> = {
  "already-voided": {
    message: "Ese lote ya estaba anulado. Sus códigos QR no sirven para votar.",
    status: 409,
  },
  "not-found": {
    message:
      "Ese lote ya no está en el evento activo. Revisá la lista y volvé a intentarlo.",
    status: 404,
  },
};

async function voidBatch(formData: FormData, eventId: string) {
  const parsed = voidVoteCodeBatchSchema.safeParse({
    batchId: readFormString(formData, "batchId"),
    intent: readFormString(formData, "intent"),
  });

  if (!parsed.success) {
    return refusal("Elegí el lote que querés anular.", 400);
  }

  const result = await voidVoteCodeBatch({
    batchId: parsed.data.batchId,
    eventId,
  });

  if (!result.ok) {
    const { message, status } = voidRefusals[result.reason];

    return refusal(message, status);
  }

  return {
    message: `Anulaste el lote ${result.number}. Sus códigos QR ya no sirven para votar.`,
    status: "success" as const,
  };
}

/**
 * The printable sheet of one batch of the active event, for administration
 * only. A voided batch does not print: its codes no longer vote. The QR
 * encodes the vote page on `APP_URL`, the app's configured origin, falling
 * back to the one the sheet was asked on.
 */
export async function loadVoteCodeSheet(
  request: Request,
  batchId: string,
): Promise<Response> {
  await requireAdminPanelUser(request);
  const { selectedEventId } = await loadEventContext(request);
  const sheet = selectedEventId
    ? await readVoteCodeBatch({ batchId, eventId: selectedEventId })
    : null;

  if (!sheet) {
    throw new Response("Lote de códigos QR no encontrado", { status: 404 });
  }

  if (sheet.voidedAt) {
    throw new Response(
      `El lote ${sheet.number} fue anulado: sus códigos QR ya no sirven para votar y no se imprimen.`,
      { status: 409 },
    );
  }

  const html = await renderVoteCodeSheet({
    origin: process.env.APP_URL || new URL(request.url).origin,
    renderQr: renderVoteCodeQrSvg,
    sheet,
  });

  // Each code on the sheet is a live vote worth ten: no browser or proxy
  // cache keeps a copy past this response.
  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

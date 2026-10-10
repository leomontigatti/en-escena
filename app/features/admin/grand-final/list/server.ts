import { data, redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { readGrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import { readFormString } from "@/lib/shared/forms";

import {
  handleAuditLinkIntent,
  listAuditLinkRows,
  readAuditLinkCreateBlockReasons,
} from "../audit-links/server";
import {
  createAuditLinkIntent,
  revokeAuditLinkIntent,
  showAuditLinkIntent,
} from "../audit-links/shared";
import {
  handleVoteCodeBatchIntent,
  listVoteCodeBatchRows,
} from "../vote-codes/server";
import {
  createVoteCodeBatchIntent,
  voidVoteCodeBatchIntent,
} from "../vote-codes/shared";
import {
  handleVotingRoundIntent,
  readVotingRoundListState,
} from "../voting-round/server";
import {
  closeVotingRoundIntent,
  hideGrandFinalResultIntent,
  openTieBreakRoundIntent,
  openVotingRoundIntent,
  publishGrandFinalResultIntent,
} from "../voting-round/shared";

import type { GrandFinalListActionData, GrandFinalListResult } from "./shared";

/**
 * Administration's `Gran final` list. Behind `requireAdminPanelUser`: the
 * auditor reads none of it, and its section is not in their navigation.
 */
export async function loadGrandFinalListRouteData(
  request: Request,
): Promise<GrandFinalListResult> {
  await requireAdminPanelUser(request);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const { selectedEventId } = eventContext;
  const [picks, voteCodeBatches, votingRound, auditLinks] = selectedEventId
    ? await Promise.all([
        readGrandFinalPicks(selectedEventId),
        listVoteCodeBatchRows(selectedEventId),
        readVotingRoundListState(selectedEventId),
        listAuditLinkRows(selectedEventId),
      ])
    : [null, [], null, []];

  return {
    auditLinkCreateBlockReasons: readAuditLinkCreateBlockReasons(auditLinks),
    auditLinks,
    picks,
    selectedEventId,
    voteCodeBatches,
    votingRound,
  };
}

const voteCodeBatchIntents: readonly string[] = [
  createVoteCodeBatchIntent,
  voidVoteCodeBatchIntent,
];

const auditLinkIntents: readonly string[] = [
  createAuditLinkIntent,
  revokeAuditLinkIntent,
  showAuditLinkIntent,
];

const votingRoundIntents: readonly string[] = [
  openVotingRoundIntent,
  closeVotingRoundIntent,
  openTieBreakRoundIntent,
  publishGrandFinalResultIntent,
  hideGrandFinalResultIntent,
];

/**
 * The list's writes: the QR code batches, the audit links, and the voting
 * round's: opening and closing it, the `Desempate`, and publishing or hiding
 * the result. Each stays:
 * the answer goes back as data for a toast and the list revalidates.
 */
export async function handleGrandFinalListAction(
  request: Request,
): Promise<GrandFinalListActionData | ReturnType<typeof data>> {
  await requireAdminPanelUser(request);
  const formData = await request.formData();

  if (voteCodeBatchIntents.includes(readFormString(formData, "intent"))) {
    return await handleVoteCodeBatchIntent(request, formData);
  }

  if (auditLinkIntents.includes(readFormString(formData, "intent"))) {
    return await handleAuditLinkIntent(request, formData);
  }

  if (votingRoundIntents.includes(readFormString(formData, "intent"))) {
    return await handleVotingRoundIntent(request, formData);
  }
  throw new Response("Acción no soportada.", { status: 400 });
}

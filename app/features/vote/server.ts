import { data, redirect } from "react-router";

import {
  castVote,
  readCodeStanding,
  type CastVoteRefusal,
  type CodeStanding,
} from "@/lib/grand-final/vote.server";
import { buildVoteCodePath, voteCodeParam } from "@/lib/grand-final/vote-url";
import {
  readActiveEventVotingRound,
  type VotingRoundFinalist,
} from "@/lib/grand-final/voting-round.server";
import { readFormString } from "@/lib/shared/forms";
import {
  createDefaultGrandFinalBannerStorage,
  loadGrandFinalBannerUrl,
  type GrandFinalBannerStorage,
} from "@/lib/storage/grand-final-banners.server";

import {
  voteFormSchema,
  type VoteActionData,
  type VoteBlockReason,
  type VoteFinalist,
  type VotePageData,
} from "./shared";

/**
 * The public vote page of the `Gran final`, `/votar`: no session, no account.
 * A visitor arrives with the code printed on their ticket, or with nothing,
 * and the page reads the active event's current round. Each answer carries a
 * live code, so none is kept by a browser or a proxy.
 */
const noStore = { "Cache-Control": "no-store" };

const blockReasonLabels: Record<VoteBlockReason["code"], string> = {
  "no-code":
    "Para votar hace falta el código QR que viene con tu entrada. Escanealo con la cámara del celular.",
  "unknown-code":
    "Este código QR no es de esta votación. Revisá que sea el que viene con tu entrada.",
  "voided-code":
    "Este código QR fue anulado por la organización y ya no sirve para votar.",
};

export async function loadVotePage(
  request: Request,
  storage: GrandFinalBannerStorage = createDefaultGrandFinalBannerStorage(),
) {
  return data(await readVotePage(request, storage), { headers: noStore });
}

async function readVotePage(
  request: Request,
  storage: GrandFinalBannerStorage,
): Promise<VotePageData> {
  const round = await readActiveEventVotingRound();

  if (!round) {
    return { state: "not-open" };
  }

  if (round.closedAt) {
    return { state: "closed" };
  }

  const token = readVoteCodeToken(request);
  const standing = token
    ? await readCodeStanding({ roundId: round.id, token })
    : null;
  const voted = findVotedFinalist(round.finalists, standing);

  if (voted) {
    return {
      finalist: await signFinalist(voted, storage),
      state: "registered",
    };
  }

  const blockReason = readBlockReason(standing);

  return {
    blockReasons: blockReason
      ? [{ code: blockReason, label: blockReasonLabels[blockReason] }]
      : [],
    code: blockReason ? null : token,
    finalists: await Promise.all(
      round.finalists.map((finalist) => signFinalist(finalist, storage)),
    ),
    state: "open",
  };
}

function readVoteCodeToken(request: Request) {
  return new URL(request.url).searchParams.get(voteCodeParam)?.trim() || null;
}

/** The finalist the code already voted for in this round, if it did. */
function findVotedFinalist(
  finalists: VotingRoundFinalist[],
  standing: CodeStanding | null,
) {
  if (standing?.status !== "voted") {
    return undefined;
  }

  return finalists.find(
    (finalist) => finalist.academyId === standing.academyId,
  );
}

const blockReasonByStanding: Partial<
  Record<CodeStanding["status"], VoteBlockReason["code"]>
> = { unknown: "unknown-code", voided: "voided-code" };

/** Why the visitor cannot vote: no code, or the one they brought. */
function readBlockReason(
  standing: CodeStanding | null,
): VoteBlockReason["code"] | null {
  return standing
    ? (blockReasonByStanding[standing.status] ?? null)
    : "no-code";
}

const refusalMessages: Record<CastVoteRefusal, string> = {
  "not-finalist":
    "Esa academia no está en esta votación. Elegí una de la lista.",
  "round-closed": "La votación ya no está abierta.",
  "unknown-code": blockReasonLabels["unknown-code"],
  "voided-code": blockReasonLabels["voided-code"],
};

function refusal(message: string, status: number) {
  return data<VoteActionData>(
    { message, status: "error" },
    { headers: noStore, status },
  );
}

/**
 * Casts the code's vote. A vote that counted, and a code that had already
 * voted, both land on the page of the code, which then reads "Tu voto fue
 * registrado"; every other answer stays on the page as a toast.
 */
export async function handleVoteAction(request: Request) {
  const formData = await request.formData();
  const parsed = voteFormSchema.safeParse({
    academyId: readFormString(formData, "academyId"),
    codigo: readFormString(formData, "codigo"),
  });

  if (!parsed.success || !parsed.data.codigo) {
    return refusal(
      "Elegí una academia y escaneá el código QR de tu entrada para votar.",
      400,
    );
  }

  const round = await readActiveEventVotingRound();

  if (!round || round.closedAt) {
    return refusal(refusalMessages["round-closed"], 409);
  }

  const token = parsed.data.codigo;
  const result = await castVote({
    academyId: parsed.data.academyId,
    identity: { kind: "code", token },
    roundId: round.id,
  });

  if (result.ok || result.reason === "already-voted") {
    throw redirect(buildVoteCodePath(token), { headers: noStore, status: 303 });
  }

  return refusal(refusalMessages[result.reason], 409);
}

async function signFinalist(
  finalist: VotingRoundFinalist,
  storage: GrandFinalBannerStorage,
): Promise<VoteFinalist> {
  const urls = await Promise.all(
    [finalist.keys.first, finalist.keys.second].map((storageKey) =>
      loadGrandFinalBannerUrl({ storage, storageKey }),
    ),
  );

  return {
    academyId: finalist.academyId,
    city: finalist.city,
    name: finalist.name,
    pictureUrls: urls.filter((url): url is string => url !== null),
  };
}

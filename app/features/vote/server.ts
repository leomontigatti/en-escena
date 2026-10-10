import { data, redirect } from "react-router";

import {
  castVote,
  readCodeStanding,
  readVoterStanding,
  type CastVoteRefusal,
  type CodeStanding,
  type VoteIdentity,
  type VoterStanding,
} from "@/lib/grand-final/vote.server";
import { readPublishedRanking } from "@/lib/grand-final/result.server";
import {
  buildVoteCodePath,
  buildVoteUrl,
  voteCodeParam,
  votePath,
} from "@/lib/grand-final/vote-url";
import { createDefaultVoterSignIn } from "@/lib/grand-final/voter-identity-providers.server";
import type { VoterSignIn } from "@/lib/grand-final/voter-sign-in.server";
import {
  readActiveEventVotingRound,
  type CurrentVotingRound,
  type VotingRoundFinalist,
} from "@/lib/grand-final/voting-round.server";
import { readFormString } from "@/lib/shared/forms";
import {
  createDefaultGrandFinalBannerStorage,
  loadGrandFinalBannerUrl,
  type GrandFinalBannerStorage,
} from "@/lib/storage/grand-final-banners.server";

import { readInAppBrowser } from "./in-app-browser";
import {
  voteFormSchema,
  type VoteActionData,
  type VoteCodeRefusal,
  type VoteFinalist,
  type VotePageData,
} from "./shared";

/**
 * The public vote page of the `Gran final`, `/votar`: no access session, no
 * account. A visitor arrives with the code printed on their ticket, signs in
 * with Google as a `voter` (ADR-0018), or arrives with nothing, and the page
 * reads the active event's current round. Each answer carries a live code or
 * a voter's sign-in, so none is kept by a browser or a proxy.
 *
 * A code in the address wins: the page votes with it and says nothing of a
 * sign-in. Without one, the voter's cookie is what votes, and without that
 * the page asks for a sign-in and shows no finalist.
 */
const noStore = { "Cache-Control": "no-store" };

export async function loadVotePage(
  request: Request,
  storage: GrandFinalBannerStorage = createDefaultGrandFinalBannerStorage(),
  signIn: VoterSignIn | null = createDefaultVoterSignIn(),
) {
  return data(await readVotePage(request, storage, signIn), {
    headers: noStore,
  });
}

async function readVotePage(
  request: Request,
  storage: GrandFinalBannerStorage,
  signIn: VoterSignIn | null,
): Promise<VotePageData> {
  const round = await readActiveEventVotingRound();

  if (!round) {
    return { state: "not-open" };
  }

  if (round.closedAt) {
    return await readClosedPage(round);
  }

  const visitor = await readVisitor(request, round.id, signIn);
  const voted = findVotedFinalist(round.finalists, visitor.standing);

  if (voted) {
    return {
      finalist: await signFinalist(voted, storage),
      state: "registered",
    };
  }

  if (!visitor.token && !visitor.voterId) {
    return readSignInPage(request, signIn);
  }

  const codeRefusal =
    visitor.token && visitor.standing
      ? codeRefusalByStanding[visitor.standing.status]
      : undefined;

  if (codeRefusal) {
    return { reason: codeRefusal, state: "code-refused" };
  }

  return {
    code: visitor.token,
    finalists: await Promise.all(
      round.finalists.map((finalist) => signFinalist(finalist, storage)),
    ),
    roundId: round.id,
    state: "open",
  };
}

/**
 * The page asks for a sign-in. Only a sign-in with Google is refused inside
 * an app's built-in browser: with no Google, the ticket's QR opens in the
 * camera's browser anyway.
 */
function readSignInPage(
  request: Request,
  signIn: VoterSignIn | null,
): VotePageData {
  return {
    google: signIn !== null,
    inAppBrowser: signIn
      ? readInAppBrowser(
          request.headers.get("User-Agent"),
          buildVoteUrl(process.env.APP_URL || new URL(request.url).origin),
        )
      : null,
    state: "sign-in",
  };
}

/**
 * A closed round's page: its ranking once administration published it, and
 * only that it closed until then. The ranking carries each finalist's share,
 * never its points or votes.
 */
async function readClosedPage(
  round: CurrentVotingRound,
): Promise<VotePageData> {
  const ranking = await readPublishedRanking(round);

  if (!ranking) {
    return { state: "closed" };
  }

  return {
    ranking: ranking.entries.map((entry) => ({
      academyId: entry.academyId,
      city: entry.city,
      name: entry.name,
      percentage: entry.percentage,
      position: entry.position,
      winner: entry.winner,
    })),
    roundNumber: round.number,
    state: "published",
    tieBrokenByCodeVotes: ranking.tieBrokenByCodeVotes,
  };
}

type Visitor = {
  standing: CodeStanding | VoterStanding | null;
  token: string | null;
  voterId: string | null;
};

/**
 * Who the visitor is to this round: the code in the address, or else the
 * voter their cookie names, and where that identity stands.
 */
async function readVisitor(
  request: Request,
  roundId: string,
  signIn: VoterSignIn | null,
): Promise<Visitor> {
  const token = readVoteCodeToken(request);

  if (token) {
    return {
      standing: await readCodeStanding({ roundId, token }),
      token,
      voterId: null,
    };
  }

  const voterId = (await signIn?.readVoterId(request)) ?? null;
  const standing = voterId
    ? await readVoterStanding({ roundId, voterId })
    : null;

  // A cookie that outlived its voter identifies nobody: the page asks for a
  // sign-in, as it does with no cookie.
  if (standing?.status === "unknown") {
    return { standing: null, token: null, voterId: null };
  }

  return { standing, token: null, voterId };
}

function readVoteCodeToken(request: Request) {
  return new URL(request.url).searchParams.get(voteCodeParam)?.trim() || null;
}

/** The finalist the code or voter already voted for in this round. */
function findVotedFinalist(
  finalists: VotingRoundFinalist[],
  standing: Visitor["standing"],
) {
  if (standing?.status !== "voted") {
    return undefined;
  }

  return finalists.find(
    (finalist) => finalist.academyId === standing.academyId,
  );
}

const codeRefusalByStanding: Partial<
  Record<CodeStanding["status"], VoteCodeRefusal>
> = { unknown: "unknown-code", voided: "voided-code" };

const refusalMessages: Record<
  Exclude<CastVoteRefusal, IdentityRefusal>,
  string
> = {
  "not-finalist":
    "Esa academia no está en esta votación. Elegí una de la lista.",
  "round-closed": "La votación ya no está abierta.",
};

const tieBreakOpenedMessage =
  "Se abrió el desempate entre las academias empatadas. Recargá la página para votar de nuevo.";

/**
 * The round a vote is cast in: the active event's open round, and only when
 * it is the round the form was loaded in. A form loaded in round 1 and sent
 * once the `Desempate` opened chose among round 1's finalists: it is refused,
 * never cast in round 2.
 */
async function findRoundToVoteIn(
  formRoundId: string,
): Promise<{ id: string } | { refusal: string }> {
  const round = await readActiveEventVotingRound();

  if (!round || round.closedAt) {
    return { refusal: refusalMessages["round-closed"] };
  }

  if (formRoundId !== round.id) {
    return { refusal: tieBreakOpenedMessage };
  }

  return { id: round.id };
}

function refusal(message: string, status: number) {
  return data<VoteActionData>(
    { message, status: "error" },
    { headers: noStore, status },
  );
}

/**
 * Casts the vote of the code in the form, or else of the signed-in voter. A
 * vote that counted, and an identity that had already voted, both land on the
 * page that reads "Tu voto fue registrado"; an identity that cannot vote goes
 * back to the page, which says why; every other answer stays on the page as
 * a toast. The voter's cookie is checked before the database is
 * touched: a request with nothing that votes costs no query.
 */
export async function handleVoteAction(
  request: Request,
  signIn: VoterSignIn | null = createDefaultVoterSignIn(),
) {
  const formData = await request.formData();
  const parsed = voteFormSchema.safeParse({
    academyId: readFormString(formData, "academyId"),
    codigo: readFormString(formData, "codigo"),
    roundId: readFormString(formData, "roundId"),
  });
  // A code in the address wins here as on the page: a request that names one
  // never falls back to the voter.
  const token = parsed.data?.codigo || readVoteCodeToken(request);
  const voterId = token ? null : await signIn?.readVoterId(request);

  if (!token && !voterId) {
    throw backToThePage(null);
  }

  if (!parsed.success) {
    return refusal(refusalMessages["not-finalist"], 400);
  }

  const round = await findRoundToVoteIn(parsed.data.roundId);

  if ("refusal" in round) {
    return refusal(round.refusal, 409);
  }

  const identity: VoteIdentity = token
    ? { kind: "code", token }
    : { kind: "voter", voterId: voterId ?? "" };
  const result = await castVote({
    academyId: parsed.data.academyId,
    identity,
    roundId: round.id,
  });

  if (
    result.ok ||
    result.reason === "already-voted" ||
    isIdentityRefusal(result.reason)
  ) {
    throw backToThePage(token);
  }

  return refusal(refusalMessages[result.reason], 409);
}

const identityRefusals = [
  "unknown-code",
  "unknown-voter",
  "voided-code",
] as const;

type IdentityRefusal = (typeof identityRefusals)[number];

function isIdentityRefusal(reason: string): reason is IdentityRefusal {
  return (identityRefusals as readonly string[]).includes(reason);
}

/**
 * Back to the page the vote came from, which reads the visitor again: the
 * vote registered, or what keeps them from voting now (a sign-in that
 * expired or outlived its voter, a code voided since the page loaded), in
 * place of a list they can no longer vote from.
 */
function backToThePage(token: string | null) {
  return redirect(token ? buildVoteCodePath(token) : votePath, {
    headers: noStore,
    status: 303,
  });
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
